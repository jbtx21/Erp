// Integrationstest gegen ECHTES Postgres (B17). Offline-Bundle enthält offene
// Aufträge mit Pflichtfeldern; doppelte Nacherfassung bleibt idempotent (eine
// einzige TimeEntry). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaContinuityRepository } from "./prisma-continuity.repository.js";
import { ContinuityService } from "../modules/continuity/continuity.service.js";

const CO = "co_b17";
const ART = "art_b17";
const VAR = "var_b17";
const ORD = "ord_b17";
const PA = "pa_b17";
const PG = "pg_b17";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaContinuityRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaContinuityRepository — Notbetrieb/Wiederanlauf gegen echtes Postgres", () => {
    const service = new ContinuityService(new PrismaContinuityRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.timeEntry.deleteMany({ where: { productionId: PA } });
      await prisma.bomItem.deleteMany({ where: { productionId: PA } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.logoVersion.deleteMany({ where: { companyId: CO } });
      // VariantAttribute referenziert Variant (FK Restrict) → vor der Variante löschen.
      await prisma.variantAttribute.deleteMany({ where: { variantId: VAR } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.logoVersion.create({ data: { companyId: CO, version: 3, fileRef: "x", active: true } });
      await prisma.article.create({ data: { id: ART, sku: "ART-B17", name: "Poloshirt" } });
      await prisma.variant.create({
        data: {
          id: VAR,
          articleId: ART,
          sku: "B17-1",
          attributes: { create: [{ name: "Farbe", value: "Navy" }, { name: "Größe", value: "L" }] },
        },
      });
      await prisma.order.create({ data: { id: ORD, number: "AB-B17-1", companyId: CO, status: "IN_PRODUKTION" } });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-B17-1", orderId: ORD } });
      await prisma.bomItem.create({ data: { productionId: PA, variantId: VAR, description: "Polo Navy L", qty: 50 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("Offline-Bundle enthält den offenen Auftrag vollständig", async () => {
      const bundle = await service.offlineBundle(new Date(Date.UTC(2026, 5, 21)));
      const item = bundle.items.find((i) => i.orderNumber === "AB-B17-1");
      expect(item).toEqual({ orderNumber: "AB-B17-1", complete: true, missing: [] });
    });

    it("doppelte Nacherfassung bleibt idempotent (eine TimeEntry)", async () => {
      const fb = { productionId: PA, userId: "u1", minutes: 30, idempotencyKey: "offline-dev-1:rec-42" };
      const first = await service.recordFeedback(fb);
      const second = await service.recordFeedback(fb);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.id).toBe(first.id);
      expect(await prisma.timeEntry.count({ where: { idempotencyKey: fb.idempotencyKey } })).toBe(1);
    });
  });
}
