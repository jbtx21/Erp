// Read-only REST-Fassade (/api/v1) für externe Agenten/MCP (Xentral-API-Vorbild).
// Auth über Personal Access Token (Bearer); RBAC über die Token-Rolle (PRODUKTION sieht
// keine Preise/Kundendaten/Finanzbelege). Bewusst NUR lesend — Mutationen laufen weiter
// über die authentifizierte tRPC-/UI-Schicht.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { redactOrderForRole, type Role } from "@texma/shared";
import type { ApiTokenService } from "../modules/api-token/api-token.service.js";
import type { OrderQueryRepository } from "../repositories/read.js";
import type { ReservationService } from "../modules/stock/reservation.service.js";
import type { InvoiceService } from "../modules/invoice/invoice.service.js";

export interface RestV1Deps {
  apiTokens: ApiTokenService;
  orders: OrderQueryRepository;
  reservations: ReservationService;
  invoices: InvoiceService;
}

const bearer = (req: FastifyRequest): string | null => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim() || null;
};

const canViewFinancials = (role: Role): boolean => role !== "PRODUKTION";

/** Registriert die read-only REST-Fassade unter /api/v1 (PAT-gesichert). */
export function registerApiV1(server: FastifyInstance, deps: RestV1Deps): void {
  // Auth-Hook nur für /api/v1: Bearer-PAT prüfen, Rolle an den Request hängen.
  server.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/v1/")) return;
    const token = bearer(req);
    const v = token ? await deps.apiTokens.verify(token) : null;
    if (!v) { await reply.code(401).send({ error: "unauthorized", message: "Gültiges Bearer-Token (PAT) erforderlich." }); return; }
    (req as FastifyRequest & { apiRole?: Role }).apiRole = v.role;
  });

  const roleOf = (req: FastifyRequest): Role => (req as FastifyRequest & { apiRole?: Role }).apiRole ?? "PRODUKTION";

  server.get("/api/v1/meta", async (req) => ({ api: "texma-v1", readOnly: true, role: roleOf(req) }));

  // Aufträge (RBAC-redigiert): PRODUKTION ohne Preise/Kundendaten.
  server.get("/api/v1/orders", async (req) => {
    const role = roleOf(req);
    const limit = Math.min(Math.max(1, Number((req.query as { limit?: string }).limit ?? 50)), 200);
    const items = await deps.orders.listRecent(limit);
    return { items: items.map((i) => redactOrderForRole(i, role)) };
  });

  // Einzelner Auftrag über die Belegnummer (AB-…).
  server.get<{ Params: { number: string } }>("/api/v1/orders/:number", async (req, reply) => {
    const role = roleOf(req);
    const items = await deps.orders.listRecent(200);
    const found = items.find((i) => i.number === req.params.number);
    if (!found) { await reply.code(404).send({ error: "not_found" }); return; }
    return redactOrderForRole(found, role);
  });

  // Shop-Bestand (verfügbar/Puffer/gemeldet) — keine Preisdaten, für alle Rollen.
  server.get("/api/v1/stock", async () => ({ items: await deps.reservations.shopStock() }));

  // Rechnungen — Finanzdaten, kein PRODUKTION-Zugriff.
  server.get("/api/v1/invoices", async (req, reply) => {
    if (!canViewFinancials(roleOf(req))) { await reply.code(403).send({ error: "forbidden" }); return; }
    const limit = Math.min(Math.max(1, Number((req.query as { limit?: string }).limit ?? 50)), 200);
    return { items: await deps.invoices.listRecent(limit) };
  });
}
