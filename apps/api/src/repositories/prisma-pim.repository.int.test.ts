// Integrationstest gegen ECHTES Postgres (B18). GTIN wird nur mit gültiger
// Prüfziffer gesetzt; Verkaufsfreigabe verlangt die Faserkennzeichnung. Nur
// RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { InvalidGtinError, LabelingIncompleteError } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaPimRepository } from "./prisma-pim.repository.js";
import { PimService } from "../modules/pim/pim.service.js";

const ART_OK = "art_pim_ok";
const ART_NO = "art_pim_no";
const VAR = "var_pim";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaPimRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaPimRepository — Textil-PIM gegen echtes Postgres", () => {
    const service = new PimService(new PrismaPimRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: { in: [ART_OK, ART_NO] } } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.article.create({
        data: { id: ART_OK, sku: "PIM-OK", name: "Poloshirt", materialComposition: "100% Baumwolle" },
      });
      await prisma.article.create({ data: { id: ART_NO, sku: "PIM-NO", name: "Cap" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART_OK, sku: "PIM-OK-1" } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("setzt gültige GTIN, lehnt ungültige Prüfziffer ab", async () => {
      await service.setVariantGtin(VAR, "4006381333931");
      const v = await prisma.variant.findUnique({ where: { id: VAR }, select: { gtin: true } });
      expect(v?.gtin).toBe("4006381333931");

      await expect(service.setVariantGtin(VAR, "4006381333930")).rejects.toBeInstanceOf(InvalidGtinError);
    });

    it("Verkaufsfreigabe nur mit Faserkennzeichnung (EU-VO 1007/2011)", async () => {
      await expect(service.assertArticleSellable(ART_OK)).resolves.toBeUndefined();
      await expect(service.assertArticleSellable(ART_NO)).rejects.toBeInstanceOf(LabelingIncompleteError);
    });
  });
}
