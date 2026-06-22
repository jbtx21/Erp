// Integrationstest gegen ECHTES Postgres (B8). Ablehnung verlangt Verlustgrund +
// erlaubten Übergang; abgelaufene Angebote erzeugen genau eine Wiedervorlage.
// Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { QuoteRejectionError, StateTransitionError } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaQuoteRepository } from "./prisma-quote.repository.js";
import { QuoteService } from "../modules/quote/quote.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";

const PG = "pg_b8";
const CO = "co_b8";
const Q_OPEN = "q_b8_open"; // wird abgelehnt
const Q_DONE = "q_b8_done"; // angenommen → Ablehnung verboten
const Q_EXP = "q_b8_exp"; // abgelaufen
const Q_FUT = "q_b8_fut"; // noch gültig

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaQuoteRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaQuoteRepository — Verfall + Verlustgrund gegen echtes Postgres", () => {
    const service = new QuoteService(new PrismaQuoteRepository(), new NumberingService(new PrismaNumberingRepository()), new MemoryAuditSink());

    async function cleanup() {
      await prisma.dueItem.deleteMany({ where: { entity: "Quote" } });
      await prisma.quote.deleteMany({ where: { companyId: CO } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.quote.create({ data: { id: Q_OPEN, number: "AN-B8-1", companyId: CO, status: "VERSENDET" } });
      await prisma.quote.create({ data: { id: Q_DONE, number: "AN-B8-2", companyId: CO, status: "ANGENOMMEN" } });
      await prisma.quote.create({ data: { id: Q_EXP, number: "AN-B8-3", companyId: CO, status: "VERSENDET", gueltigBisAm: new Date(Date.UTC(2026, 4, 1)) } });
      await prisma.quote.create({ data: { id: Q_FUT, number: "AN-B8-4", companyId: CO, status: "VERSENDET", gueltigBisAm: new Date(Date.UTC(2026, 11, 1)) } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("Ablehnung verlangt Grund und erlaubten Übergang", async () => {
      await expect(service.reject(Q_OPEN, "  ")).rejects.toBeInstanceOf(QuoteRejectionError);
      await expect(service.reject(Q_DONE, "zu teuer")).rejects.toBeInstanceOf(StateTransitionError);

      await service.reject(Q_OPEN, "  Wettbewerber günstiger  ");
      const q = await prisma.quote.findUnique({ where: { id: Q_OPEN } });
      expect(q).toMatchObject({ status: "ABGELEHNT", verlustgrund: "Wettbewerber günstiger" });
    });

    it("abgelaufene Angebote erzeugen genau eine Wiedervorlage (idempotent)", async () => {
      const now = new Date(Date.UTC(2026, 5, 21));
      const first = await service.expireOverdue(now);
      expect(first).toEqual([Q_EXP]); // Q_FUT noch gültig, Q_OPEN/Q_DONE final/ohne Frist

      const second = await service.expireOverdue(now);
      expect(second).toEqual([]); // keine Doppel-Wiedervorlage

      expect(await prisma.dueItem.count({ where: { entity: "Quote", entityId: Q_EXP } })).toBe(1);
    });
  });
}
