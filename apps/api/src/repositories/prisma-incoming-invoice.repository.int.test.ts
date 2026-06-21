// Integrationstest gegen ECHTES Postgres (C4). Prüft den E-Rechnung-Empfang auf
// Datenbankebene: Lieferantenauflösung (vatId), Persistenz als IncomingInvoice und
// Idempotenz über das Unique (supplierId, number). Nur mit RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { buildEInvoiceXml, type EInvoiceModel } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaIncomingInvoiceRepository } from "./prisma-incoming-invoice.repository.js";
import { IncomingInvoiceService } from "../modules/incoming-invoice/incoming-invoice.service.js";

const SUP = "sup_test_einvoice";
const VAT = "DE999888777";

const model = (number: string): EInvoiceModel => ({
  invoiceNumber: number,
  issueDate: new Date(Date.UTC(2026, 5, 10)),
  currency: "EUR",
  seller: { name: "Test Lieferant GmbH", vatId: VAT, country: "DE" },
  buyer: { name: "TEXMA GmbH", country: "DE" },
  lines: [{ id: "1", name: "Textil", qty: 10, unitNetCents: 1000, lineNetCents: 10000, vatRatePercent: 19 }],
  netCents: 10000,
  taxCents: 1900,
  grossCents: 11900,
});

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaIncomingInvoiceRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("PrismaIncomingInvoiceRepository — E-Rechnung-Empfang gegen echtes Postgres", () => {
    const repo = new PrismaIncomingInvoiceRepository();
    const service = new IncomingInvoiceService(repo, new MemoryAuditSink());

    async function cleanup() {
      await prisma.incomingInvoice.deleteMany({ where: { supplierId: SUP } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.supplier.create({
        data: { id: SUP, name: "Test Lieferant GmbH", vatId: VAT, kind: "MANUAL" },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("erfasst eine gültige E-Rechnung idempotent und löst über die USt-IdNr. auf", async () => {
      const first = await service.receive(buildEInvoiceXml(model("ER-INT-1")));
      expect(first).toMatchObject({ status: "ERFASST", supplierId: SUP, created: true });

      const again = await service.receive(buildEInvoiceXml(model("ER-INT-1")));
      expect(again).toMatchObject({ status: "ERFASST", created: false });

      expect(await prisma.incomingInvoice.count({ where: { supplierId: SUP } })).toBe(1);
      const inv = await prisma.incomingInvoice.findUnique({
        where: { supplierId_number: { supplierId: SUP, number: "ER-INT-1" } },
      });
      expect(inv).toMatchObject({ grossCents: 11900, status: "ERFASST" });
    });

    it("schickt unbekannte Lieferanten in die Klärung (kein Persistieren)", async () => {
      const res = await service.receive(
        buildEInvoiceXml({ ...model("ER-INT-2"), seller: { name: "Fremd GmbH", vatId: "DE000000000", country: "DE" } })
      );
      expect(res).toMatchObject({ status: "KLAERUNG", reason: "LIEFERANT_UNBEKANNT" });
    });
  });
}
