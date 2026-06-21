// Integrationstest gegen ECHTES Postgres (B11). Folgevorgang je Reklamationstyp:
// GUTSCHRIFT → CreditNote (Nummer aus F1); (EXPRESS_)NACHPRODUKTION → Nachproduktions-
// Auftrag mit Verweis auf den Ursprung; KEINE → nichts. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaReklamationRepository } from "./prisma-reklamation.repository.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { ReklamationService } from "../modules/reklamation/reklamation.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";

const PG = "pg_b11";
const CO = "co_b11";
const ORD = "ord_b11";
const INV = "inv_b11";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("Reklamation-Folgevorgang (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("ReklamationService.executeFollowUp — Folgevorgänge gegen echtes Postgres", () => {
    const service = new ReklamationService(
      new PrismaReklamationRepository(),
      new MemoryAuditSink(),
      new NumberingService(new PrismaNumberingRepository())
    );

    async function cleanup() {
      await prisma.creditNote.deleteMany({ where: { invoiceId: INV } });
      await prisma.complaint.deleteMany({ where: { orderId: ORD } });
      await prisma.order.deleteMany({ where: { nachproduktionVonId: ORD } });
      await prisma.invoice.deleteMany({ where: { id: INV } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.numberSequence.deleteMany({ where: { year: 2026, key: { in: ["CREDIT_NOTE", "ORDER"] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.order.create({ data: { id: ORD, number: "AB-B11-1", companyId: CO } });
      await prisma.invoice.create({ data: { id: INV, number: "RE-B11-1", orderId: ORD, companyId: CO, netCents: 5000, taxCents: 950, grossCents: 5950 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("GUTSCHRIFT erzeugt eine CreditNote mit F1-Nummer", async () => {
      const c = await service.create({ orderId: ORD, orderLineId: "l1", cause: "LIEFERANT", followUp: "GUTSCHRIFT", costCents: 3000 });
      const res = await service.executeFollowUp(c.id);
      expect(res).toMatchObject({ type: "CREDIT_NOTE", amountCents: 3000 });
      const cn = await prisma.creditNote.findFirst({ where: { invoiceId: INV } });
      expect(cn).toMatchObject({ amountCents: 3000 });
      expect(cn!.number).toMatch(/^GS-2026-\d{4}$/);
    });

    it("EXPRESS_NACHPRODUKTION erzeugt einen Nachproduktions-Auftrag mit Ursprungsverweis", async () => {
      const c = await service.create({ orderId: ORD, orderLineId: "l2", cause: "INTERN", followUp: "EXPRESS_NACHPRODUKTION", costCents: 1500 });
      const res = await service.executeFollowUp(c.id);
      expect(res).toMatchObject({ type: "REPRODUCTION", express: true });
      const repro = await prisma.order.findFirst({ where: { nachproduktionVonId: ORD } });
      expect(repro).not.toBeNull();
      expect(repro!.number).toMatch(/^AB-2026-\d{4}$/);
      expect(repro!.companyId).toBe(CO);
    });

    it("KEINE erzeugt keinen Folgevorgang", async () => {
      const c = await service.create({ orderId: ORD, orderLineId: "l3", cause: "INTERN", followUp: "KEINE", costCents: 0 });
      expect(await service.executeFollowUp(c.id)).toEqual({ type: "NONE" });
    });
  });
}
