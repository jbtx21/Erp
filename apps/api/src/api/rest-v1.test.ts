import { describe, expect, it, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerApiV1, type RestV1Deps } from "./rest-v1.js";
import { ApiTokenService } from "../modules/api-token/api-token.service.js";
import { InMemoryApiTokenRepository } from "../repositories/in-memory-api-token.repository.js";

class MemAudit { async append(): Promise<void> { /* noop */ } }

const ORDERS = [
  { id: "o1", number: "AB-2026-0001", companyId: "c1", companyName: "Muster GmbH", status: "ANGELEGT", lieferstatus: "NICHT", fakturastatus: "NICHT", zugesagterLiefertermin: null, externalNumber: null, employeeNote: "Hinweis", totalNetCents: 50000, fastLane: false, allowedTransitions: ["IN_BEARBEITUNG", "STORNIERT"], createdAt: new Date(0) },
];

function deps(svc: ApiTokenService): RestV1Deps {
  return {
    apiTokens: svc,
    orders: { listRecent: async () => ORDERS, orderLines: async () => [] } as unknown as RestV1Deps["orders"],
    reservations: { shopStock: async () => [{ variantId: "v1", sku: "S1", name: "Shirt", availableHaupt: 10, puffer: 2, shopQty: 8 }] } as unknown as RestV1Deps["reservations"],
    invoices: { listRecent: async () => [{ id: "i1", number: "RE-2026-0001", orderId: "o1", companyId: "c1", netCents: 50000, taxCents: 9500, grossCents: 59500, openCents: 59500, dueDate: null, issuedAt: new Date(0) }] } as unknown as RestV1Deps["invoices"],
  };
}

let app: FastifyInstance;
let bueroToken: string;
let prodToken: string;

beforeAll(async () => {
  const svc = new ApiTokenService(new InMemoryApiTokenRepository(), new MemAudit());
  bueroToken = (await svc.create("buero", "BUERO")).token;
  prodToken = (await svc.create("prod", "PRODUKTION")).token;
  app = Fastify();
  registerApiV1(app, deps(svc));
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe("REST /api/v1 (PAT-gesichert, read-only)", () => {
  it("ohne Token → 401", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/orders" });
    expect(r.statusCode).toBe(401);
  });

  it("BUERO sieht Aufträge inkl. Preise/Kunde", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/orders", headers: { authorization: `Bearer ${bueroToken}` } });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { items: Array<{ totalNetCents: number | null; companyName: string | null }> };
    expect(body.items[0]?.totalNetCents).toBe(50000);
    expect(body.items[0]?.companyName).toBe("Muster GmbH");
  });

  it("PRODUKTION bekommt Preise redigiert (RBAC: nur Finanzdaten)", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/orders", headers: { authorization: `Bearer ${prodToken}` } });
    const body = r.json() as { items: Array<{ totalNetCents: number | null; number: string }> };
    expect(body.items[0]?.totalNetCents).toBeNull(); // Preis redigiert
    expect(body.items[0]?.number).toBe("AB-2026-0001"); // Belegdaten weiter sichtbar
  });

  it("PRODUKTION darf keine Rechnungen sehen → 403", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/invoices", headers: { authorization: `Bearer ${prodToken}` } });
    expect(r.statusCode).toBe(403);
  });

  it("Bestand ist für alle Rollen lesbar", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/stock", headers: { authorization: `Bearer ${prodToken}` } });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("Einzelauftrag über Belegnummer", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/orders/AB-2026-0001", headers: { authorization: `Bearer ${bueroToken}` } });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { number: string }).number).toBe("AB-2026-0001");
  });
});
