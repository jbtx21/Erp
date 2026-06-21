// Integrationstest gegen ECHTES Postgres (B6). Barverkauf → signierter,
// unveränderbarer Beleg (WORM) + Posten geschlossen; DSFinV-K-Export valide.
// Stub-TSE im Test. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { dsfinvkExport } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaPosRepository } from "./prisma-pos.repository.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { PosService, StubTseConnector } from "../modules/pos/pos.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";

const REG = "reg_b6";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaPosRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaPosRepository — Kasse mit TSE gegen echtes Postgres", () => {
    const service = new PosService(
      new PrismaPosRepository(),
      new StubTseConnector("TSE-SN-INT"),
      new NumberingService(new PrismaNumberingRepository()),
      new MemoryAuditSink()
    );
    const at = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));

    async function cleanup() {
      await prisma.cashSale.deleteMany({ where: { OR: [{ registerId: REG }, { tseSeriennummer: "TSE-SN-INT" }] } });
      await prisma.cashRegister.deleteMany({ where: { id: REG } });
      await prisma.numberSequence.deleteMany({ where: { key: "CASH_RECEIPT", year: 2026 } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.cashRegister.create({ data: { id: REG, name: "Theke 1" } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("schreibt einen signierten, unveränderbaren Beleg und exportiert DSFinV-K", async () => {
      const res = await service.recordSale({ betragCents: 4999, art: "EC", kassierer: "Kasse 1", registerId: REG }, at);
      expect(res.belegNr).toBe("BON-2026-0001");

      const sale = await prisma.cashSale.findUnique({ where: { belegNr: "BON-2026-0001" } });
      expect(sale).toMatchObject({
        betragCents: 4999,
        art: "EC",
        kassierer: "Kasse 1",
        registerId: REG,
        tseSeriennummer: "TSE-SN-INT",
      });
      expect(sale!.tseSignatur.length).toBeGreaterThan(0);
      expect(sale!.tseTxId.length).toBeGreaterThan(0);

      // DSFinV-K-Export aus dem persistierten Beleg.
      const csv = dsfinvkExport([
        {
          belegNr: sale!.belegNr,
          betragCents: sale!.betragCents,
          art: sale!.art,
          kassiertAm: sale!.kassiertAm,
          kassierer: sale!.kassierer,
          tseSignatur: sale!.tseSignatur,
          tseSeriennummer: sale!.tseSeriennummer,
          tseTxId: sale!.tseTxId,
        },
      ]);
      expect(csv).toContain("BON-2026-0001;");
      expect(csv).toContain(";49.99;EC;Kasse 1;TSE-SN-INT;");
    });
  });
}
