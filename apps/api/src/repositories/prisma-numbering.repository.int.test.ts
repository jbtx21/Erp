// Integrationstest gegen ECHTES Postgres (F1, GoBD Kap. 10/19). Prüft die
// Kerngarantie des Nummernkreises: lückenlos und kollisionsfrei — auch bei
// paralleler Vergabe. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";

const YEAR = 2099; // Test-Jahr, kollidiert nicht mit echten Belegen
const KEYS = ["INVOICE", "CREDIT_NOTE"] as const;

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaNumberingRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaNumberingRepository — lückenlose Belegnummern gegen echtes Postgres", () => {
    const repo = new PrismaNumberingRepository();
    const service = new NumberingService(repo);

    async function cleanup() {
      await prisma.numberSequence.deleteMany({ where: { key: { in: [...KEYS] }, year: YEAR } });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("vergibt sequentiell lückenlos ab 1", async () => {
      const at = new Date(Date.UTC(YEAR, 0, 1));
      expect(await service.next("INVOICE", at)).toBe(`RE-${YEAR}-0001`);
      expect(await service.next("INVOICE", at)).toBe(`RE-${YEAR}-0002`);
      expect(await service.next("INVOICE", at)).toBe(`RE-${YEAR}-0003`);
    });

    it("hält je Belegart einen eigenen Kreis", async () => {
      const at = new Date(Date.UTC(YEAR, 0, 1));
      expect(await service.next("CREDIT_NOTE", at)).toBe(`GS-${YEAR}-0001`);
    });

    it("bleibt bei paralleler Vergabe lückenlos und kollisionsfrei", async () => {
      const before = (await prisma.numberSequence.findUnique({
        where: { key_year: { key: "INVOICE", year: YEAR } },
      }))!.next;

      const N = 50;
      const seqs = await Promise.all(
        Array.from({ length: N }, () => repo.nextSeq("INVOICE", YEAR))
      );

      const sorted = [...seqs].sort((a, b) => a - b);
      // Distinkt (keine Dublette) und lückenlos aufsteigend.
      expect(new Set(seqs).size).toBe(N);
      expect(sorted[0]).toBe(before + 1);
      expect(sorted[N - 1]).toBe(before + N);
      for (let i = 1; i < N; i++) expect(sorted[i]).toBe(sorted[i - 1]! + 1);
    });
  });
}
