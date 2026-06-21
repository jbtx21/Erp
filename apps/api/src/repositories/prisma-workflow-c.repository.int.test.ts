// Integrationstest gegen ECHTES Postgres (Kap. 20/35.4/5.4). Deckt Reklamation
// (Persistenz), Ampel (Angebot+Produktion) und Stickerei (Firmen-Stammdaten) ab.
// Distinkter PriceGroup.kind (WIEDERVERKAEUFER). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaReklamationRepository } from "./prisma-reklamation.repository.js";
import { PrismaAmpelRepository } from "./prisma-ampel.repository.js";
import { PrismaStickereiRepository } from "./prisma-stickerei.repository.js";
import { ReklamationService } from "../modules/reklamation/reklamation.service.js";
import { AmpelService } from "../modules/ampel/ampel.service.js";
import { StickereiService } from "../modules/stickerei/stickerei.service.js";

const PG = "pg_wc";
const CO = "co_wc";
const SUP = "sup_wc";
const ORD = "order_wc";
const PA = "pa_wc";
const QUO = "quote_wc";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("Workflow C / Ampel / Stickerei (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("Workflow C / Ampel / Stickerei gegen echtes Postgres", () => {
    const reklamation = new ReklamationService(new PrismaReklamationRepository(), new MemoryAuditSink());
    const ampel = new AmpelService(new PrismaAmpelRepository());
    const stickerei = new StickereiService(new PrismaStickereiRepository());

    async function cleanup() {
      await prisma.complaint.deleteMany({ where: { orderId: ORD } });
      await prisma.quote.deleteMany({ where: { id: QUO } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.orderLine.deleteMany({ where: { orderId: ORD } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "WIEDERVERKAEUFER", name: "WV" } });
      await prisma.supplier.create({ data: { id: SUP, name: "Stickerei-Partner", kind: "MANUAL" } });
      await prisma.company.create({
        data: { id: CO, name: "ACME GmbH", priceGroupId: PG, stickereiPartnerId: SUP, hatStickdatei: true },
      });
      await prisma.order.create({
        data: { id: ORD, number: "AB-WC-1", companyId: CO, lines: { create: { position: 1, description: "Shirt", qty: 1, unitNetCents: 1000 } } },
      });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-WC-1", orderId: ORD, dueDate: new Date(Date.UTC(2026, 4, 1)) } });
      await prisma.quote.create({ data: { id: QUO, number: "AN-WC-1", companyId: CO, wiedervorlageAm: new Date(Date.UTC(2026, 11, 1)) } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("Reklamation: persistiert mit abgeleitetem Kostenträger", async () => {
      const line = await prisma.orderLine.findFirst({ where: { orderId: ORD } });
      const res = await reklamation.create({ orderId: ORD, orderLineId: line!.id, cause: "LIEFERANT", followUp: "GUTSCHRIFT", costCents: 1500 });
      expect(res.costBearer).toBe("LIEFERANT");
      const list = await reklamation.listByOrder(ORD, 10);
      expect(list[0]).toMatchObject({ costBearer: "LIEFERANT", costCents: 1500 });
    });

    it("Ampel: überfällige Produktion (ROT) vor Angebot-Wiedervorlage (GRÜN)", async () => {
      const rows = (await ampel.overview(new Date(Date.UTC(2026, 5, 15)))).filter((r) => [PA, QUO].includes(r.id));
      const pa = rows.find((r) => r.id === PA);
      const quo = rows.find((r) => r.id === QUO);
      expect(pa?.ampel).toBe("ROT");
      expect(quo?.ampel).toBe("GRUEN");
    });

    it("Stickerei: DIREKT bei hinterlegtem Partner + Stickdatei", async () => {
      expect((await stickerei.routeForCompany(CO)).route).toBe("DIREKT");
    });
  });
}
