// Vertikaler Slice durch die tRPC-Schicht: T-01 (Shop-Ingest), RBAC-Redaktion
// (Produktion ohne Preise) und die Auth-Guards. In-Memory, keine DB.

import { describe, expect, it, vi } from "vitest";
import { buildEInvoiceXml } from "@texma/shared";
import type { AuthUser } from "../modules/auth/auth.service.js";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { OrderImportService } from "../modules/shop-import/order-import.service.js";
import { SupplierImportService } from "../modules/supplier-import/supplier-import.service.js";
import { IncomingInvoiceService } from "../modules/incoming-invoice/incoming-invoice.service.js";
import { ShipmentService } from "../modules/shipment/shipment.service.js";
import { BankingImportService } from "../modules/banking/banking-import.service.js";
import { DunningService } from "../modules/dunning/dunning.service.js";
import { ProcurementService } from "../modules/procurement/procurement.service.js";
import { SubProductionService } from "../modules/subproduction/subproduction.service.js";
import { ThreeWayMatchService } from "../modules/three-way-match/three-way-match.service.js";
import { PostCalcService } from "../modules/postcalc/postcalc.service.js";
import { ReklamationService } from "../modules/reklamation/reklamation.service.js";
import { AmpelService } from "../modules/ampel/ampel.service.js";
import { StickereiService } from "../modules/stickerei/stickerei.service.js";
import { ReorderService } from "../modules/reorder/reorder.service.js";
import { ProductionSheetService } from "../modules/production-sheet/production-sheet.service.js";
import { ReportingService } from "../modules/reporting/reporting.service.js";
import { ProductionReportingService } from "../modules/production-reporting/production-reporting.service.js";
import { InMemoryOrderRepository } from "../repositories/in-memory-order.repository.js";
import { InMemorySupplierRepository } from "../repositories/in-memory-supplier.repository.js";
import { InMemoryIncomingInvoiceRepository } from "../repositories/in-memory-incoming-invoice.repository.js";
import { InMemoryShipmentRepository } from "../repositories/in-memory-shipment.repository.js";
import { InMemoryBankingRepository } from "../repositories/in-memory-banking.repository.js";
import { InMemoryDunningRepository } from "../repositories/in-memory-dunning.repository.js";
import { InMemoryProcurementRepository } from "../repositories/in-memory-procurement.repository.js";
import { InMemorySubProductionRepository } from "../repositories/in-memory-subproduction.repository.js";
import { InMemoryThreeWayMatchRepository } from "../repositories/in-memory-three-way-match.repository.js";
import { InMemoryPostCalcRepository } from "../repositories/in-memory-postcalc.repository.js";
import { InMemoryReklamationRepository } from "../repositories/in-memory-reklamation.repository.js";
import { InMemoryAmpelRepository } from "../repositories/in-memory-ampel.repository.js";
import { InMemoryStickereiRepository } from "../repositories/in-memory-stickerei.repository.js";
import { InMemoryReorderRepository } from "../repositories/in-memory-reorder.repository.js";
import { InMemoryProductionSheetRepository } from "../repositories/in-memory-production-sheet.repository.js";
import { InMemoryReportingRepository } from "../repositories/in-memory-reporting.repository.js";
import { InMemoryProductionReportingRepository } from "../repositories/in-memory-production-reporting.repository.js";
import { appRouter } from "./router.js";
import { createCallerFactory } from "./trpc.js";
import type { Context } from "./trpc.js";

const BUERO: AuthUser = { id: "u1", email: "b@texma.de", name: "Büro", role: "BUERO", totpEnabled: false };
const PRODUKTION: AuthUser = { id: "u2", email: "p@texma.de", name: "Prod", role: "PRODUKTION", totpEnabled: false };
const BUCHHALTUNG: AuthUser = { id: "u3", email: "f@texma.de", name: "Fibu", role: "BUCHHALTUNG", totpEnabled: false };

function setup(user: AuthUser | null = BUERO) {
  const repo = new InMemoryOrderRepository(new Set(["company_acme"]));
  const orderImport = new OrderImportService(repo, new MemoryAuditSink());
  const supplierRepo = new InMemorySupplierRepository(new Map([["0020-RED-L", "var_1"]]));
  const supplierImport = new SupplierImportService(supplierRepo, new MemoryAuditSink());
  const invoiceRepo = new InMemoryIncomingInvoiceRepository([
    { id: "sup_acme", name: "ACME GmbH", vatId: "DE123456789" },
  ]);
  const incomingInvoiceImport = new IncomingInvoiceService(invoiceRepo, new MemoryAuditSink());
  const shipmentRepo = new InMemoryShipmentRepository([
    {
      id: "order_ship",
      number: "WC-500",
      externalNumber: "500",
      shopConnectorId: "shop_acme",
      recipient: { name: "ACME GmbH", street: "Hauptstr. 1", zip: "71083", city: "Herrenberg", country: "DE" },
      weightGrams: 1000,
    },
  ]);
  const shipments = new ShipmentService(shipmentRepo, new MemoryAuditSink());
  const bankingRepo = new InMemoryBankingRepository([
    { id: "oi_1", invoiceNumber: "R-2026-001", openCents: 11900 },
  ]);
  const bankingImport = new BankingImportService(bankingRepo, new MemoryAuditSink());
  const dunningRepo = new InMemoryDunningRepository([
    {
      id: "oi_due",
      invoiceNumber: "R-2026-009",
      openCents: 5000,
      dueDate: new Date(Date.UTC(2026, 4, 1)),
      dunningLevel: 0,
      mahnsperre: false,
    },
  ]);
  const dunning = new DunningService(dunningRepo, new MemoryAuditSink());
  // T-05: PA braucht Textil von zwei Lieferanten; nur FHB ist eingegangen.
  const procurementRepo = new InMemoryProcurementRepository(
    {
      pa_1: [
        { variantId: "v_fhb", supplierId: "sup_fhb", qty: 10 },
        { variantId: "v_ss", supplierId: "sup_ss", qty: 5 },
      ],
    },
    { pa_1: [{ variantId: "v_fhb", supplierId: "sup_fhb", receivedQty: 10 }] }
  );
  const procurement = new ProcurementService(procurementRepo);
  // T-04: Stufe 1 (Siebdruck) offen, Stufe 2 (Stick) wartet.
  const subRepo = new InMemorySubProductionRepository([
    { id: "sub_1", productionId: "pa_1", sequence: 1, supplierId: "sup_sieb", status: "OFFEN", beistellungVersandtAm: null, ruecklaufErhaltenAm: null },
    { id: "sub_2", productionId: "pa_1", sequence: 2, supplierId: "sup_stick", status: "OFFEN", beistellungVersandtAm: null, ruecklaufErhaltenAm: null },
  ]);
  const subproduction = new SubProductionService(subRepo, new MemoryAuditSink());
  // 9.6: Rechnung iinv_ok hat passende PO (10×500, alles geliefert); iinv_bad teurer.
  const twmRepo = new InMemoryThreeWayMatchRepository({
    iinv_ok: { po: { poQty: 10, poUnitCents: 500, receivedQty: 10 } },
    iinv_bad: { po: { poQty: 10, poUnitCents: 500, receivedQty: 10 } },
    iinv_nopo: { po: null },
  });
  const threeWayMatch = new ThreeWayMatchService(twmRepo, new MemoryAuditSink());
  // T-10: Ist-Material/-Lohn höher als geplant → schlechterer DB.
  const postcalcRepo = new InMemoryPostCalcRepository({
    pa_1: { revenueCents: 100000, materialCents: 40000, laborMinutes: 600 },
  });
  const postcalc = new PostCalcService(postcalcRepo);
  const reklamationRepo = new InMemoryReklamationRepository();
  const reklamation = new ReklamationService(reklamationRepo, new MemoryAuditSink());
  const ampel = new AmpelService(
    new InMemoryAmpelRepository([
      { id: "p_late", level: "PRODUKTION", label: "PA-1", dueDate: new Date(Date.UTC(2026, 4, 1)), done: false },
      { id: "p_ok", level: "AUFTRAG", label: "AB-1", dueDate: new Date(Date.UTC(2026, 11, 1)), done: false },
    ])
  );
  const stickerei = new StickereiService(
    new InMemoryStickereiRepository({
      c_direkt: { stickereiPartnerId: "sup_stick", hatStickdatei: true },
      c_neu: { stickereiPartnerId: null, hatStickdatei: false },
    })
  );
  // T-12: v1 unterschreitet Mindestbestand (3<10) → Vorschlag, v2 ausreichend.
  const reorderRepo = new InMemoryReorderRepository([
    { variantId: "v1", qty: 3, minStock: 10, supplierId: "sup_id", ekCents: 500 },
    { variantId: "v2", qty: 20, minStock: 5, supplierId: "sup_id", ekCents: 400 },
  ]);
  const reorder = new ReorderService(reorderRepo, new MemoryAuditSink());
  // T-11: PA mit Basisfeldern; vorlagenspezifische Felder kommen als extra.
  const productionSheet = new ProductionSheetService(
    new InMemoryProductionSheetRepository({
      pa_1: { orderNumber: "AB-1", articleName: "Polo", farbe: "Blau", groesse: "XL", qty: 50, logoLabel: "Logo v3" },
    })
  );
  // Kap. 29: zwei Rechnungen (Mai/Juni) + zwei Aufträge für die Reporting-Endpunkte.
  const reporting = new ReportingService(
    new InMemoryReportingRepository(
      [
        { at: new Date("2026-05-10T09:00:00Z"), netCents: 20_000 },
        { at: new Date("2026-06-05T09:00:00Z"), netCents: 30_000 },
      ],
      [
        { at: new Date("2026-05-10T09:00:00Z"), netCents: 25_000 },
        { at: new Date("2026-06-05T09:00:00Z"), netCents: 35_000 },
      ],
      [
        { at: new Date("2026-05-10T09:00:00Z"), label: "shop_a", name: "Shop A", netCents: 30_000 },
        { at: new Date("2026-06-05T09:00:00Z"), label: "shop_b", name: "Shop B", netCents: 20_000 },
      ],
      [
        { at: new Date("2026-05-10T09:00:00Z"), label: "STANDARD", name: "Standard", netCents: 35_000 },
        { at: new Date("2026-06-05T09:00:00Z"), label: "PREMIUM", name: "Premium", netCents: 15_000 },
      ],
      [
        { at: new Date("2026-06-01T09:00:00Z"), label: "Polo / L", name: "Polo / L", netCents: 40_000 },
        { at: new Date("2026-06-02T09:00:00Z"), label: "Stick Brust", name: "Stick Brust", netCents: 10_000 },
      ]
    )
  );
  // Kap. 29/35: operative KPIs (Durchlaufzeit/Fehlerquote) — auch für PRODUKTION.
  const productionReporting = new ProductionReportingService(
    new InMemoryProductionReportingRepository(
      [
        { at: new Date("2026-06-05T00:00:00Z"), hours: 24 },
        { at: new Date("2026-06-20T00:00:00Z"), hours: 72 },
      ],
      [
        { at: new Date("2026-06-01T00:00:00Z"), defective: false },
        { at: new Date("2026-06-02T00:00:00Z"), defective: true, cause: "INTERN" },
      ],
      [
        { at: new Date("2026-06-05T00:00:00Z"), onTime: true },
        { at: new Date("2026-06-10T00:00:00Z"), onTime: false },
      ]
    )
  );
  const ctx: Context = {
    orderImport,
    orders: repo,
    supplierImport,
    suppliers: supplierRepo,
    incomingInvoiceImport,
    incomingInvoices: invoiceRepo,
    shipments,
    bankingImport,
    banking: bankingRepo,
    dunning,
    dunningQuery: dunningRepo,
    procurement,
    subproduction,
    threeWayMatch,
    postcalc,
    reklamation,
    ampel,
    stickerei,
    reorder,
    productionSheet,
    reporting,
    productionReporting,
    auth: {} as Context["auth"],
    user,
    sessionToken: user ? "tok" : null,
    setSessionCookie: vi.fn(),
    clearSessionCookie: vi.fn(),
  };
  const caller = createCallerFactory(appRouter)(ctx);
  return { caller, repo, supplierRepo, invoiceRepo, shipmentRepo, bankingRepo, dunningRepo, subRepo, twmRepo, reorderRepo };
}

const woo = (number: string, first: string) => ({
  id: Number(number.replace(/\D/g, "")),
  number,
  status: "processing",
  billing: { first_name: first, last_name: "X", email: `${first}@acme.de` },
  line_items: [{ name: "T-Shirt / L", quantity: 3, price: "19.90" }],
});

const cfg = { shopConnectorId: "shop_acme", companyId: "company_acme" };

describe("tRPC shopOrders — T-01 durch die Service-/Router-Schicht", () => {
  it("zwei Bestellungen verschiedener Mitarbeiter → eine Firma, keine neuen Firmen", async () => {
    const { caller, repo } = setup();
    const before = await repo.countCompanies();

    const a = await caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const b = await caller.shopOrders.ingest({ raw: woo("WC-2", "erika"), ...cfg });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.order.companyId).toBe("company_acme");
    expect(b.order.companyId).toBe("company_acme");
    expect(await repo.countCompanies()).toBe(before); // T-01: 0 neue Company-Zeilen
  });

  it("ist idempotent bei gleicher externer Bestellnummer", async () => {
    const { caller } = setup();
    const a = await caller.shopOrders.ingest({ raw: woo("WC-9", "max"), ...cfg });
    const b = await caller.shopOrders.ingest({ raw: woo("WC-9", "max"), ...cfg });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.order.id).toBe(a.order.id);
  });
});

describe("tRPC RBAC — Produktion ohne Preis-/Kundenzugriff (Kap. 12)", () => {
  it("BUERO sieht Preis und Kundenvermerk", async () => {
    const { caller } = setup(BUERO);
    await caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const list = await caller.shopOrders.list();
    expect(list[0]?.totalNetCents).toBe(3 * 1990);
    expect(list[0]?.employeeNote).toContain("max");
  });

  it("PRODUKTION erhält redigierte Preis-/Kundenfelder (null)", async () => {
    // Auftrag von BUERO anlegen, dann als PRODUKTION lesen.
    const buero = setup(BUERO);
    await buero.caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const prod = createCallerFactory(appRouter)({
      orderImport: {} as Context["orderImport"],
      orders: buero.repo,
      supplierImport: {} as Context["supplierImport"],
      suppliers: buero.supplierRepo,
      incomingInvoiceImport: {} as Context["incomingInvoiceImport"],
      incomingInvoices: buero.invoiceRepo,
      shipments: {} as Context["shipments"],
      bankingImport: {} as Context["bankingImport"],
      banking: buero.bankingRepo,
      dunning: {} as Context["dunning"],
      dunningQuery: buero.dunningRepo,
      procurement: {} as Context["procurement"],
      subproduction: {} as Context["subproduction"],
      threeWayMatch: {} as Context["threeWayMatch"],
      postcalc: {} as Context["postcalc"],
      reklamation: {} as Context["reklamation"],
      ampel: {} as Context["ampel"],
      stickerei: {} as Context["stickerei"],
      reorder: {} as Context["reorder"],
      productionSheet: {} as Context["productionSheet"],
      reporting: {} as Context["reporting"],
      productionReporting: {} as Context["productionReporting"],
      auth: {} as Context["auth"],
      user: PRODUKTION,
      sessionToken: "tok",
      setSessionCookie: vi.fn(),
      clearSessionCookie: vi.fn(),
    });
    const list = await prod.shopOrders.list();
    expect(list[0]?.number).toBe("WC-WC-1"); // nicht-sensibles Feld bleibt
    expect(list[0]?.totalNetCents).toBeNull();
    expect(list[0]?.employeeNote).toBeNull();
  });
});

describe("tRPC Auth-Guards", () => {
  it("ohne Session wird die Auftragsliste mit UNAUTHORIZED abgewiesen", async () => {
    const { caller } = setup(null);
    await expect(caller.shopOrders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("me liefert den eingeloggten Nutzer", async () => {
    const { caller } = setup(BUERO);
    expect(await caller.auth.me()).toMatchObject({ role: "BUERO", email: "b@texma.de" });
  });
});

describe("tRPC suppliers — Katalog-Import + RBAC (C3, Kap. 6/12)", () => {
  const catalogItem = {
    supplierSku: "IDI-0020",
    sku: "0020-RED-L",
    ekCents: 590,
    availableQty: 120,
  };

  it("BUERO importiert den Katalog und liest die Lieferanten-Artikel", async () => {
    const { caller } = setup(BUERO);
    const res = await caller.suppliers.ingestCatalog({
      supplierId: "sup_1",
      items: [catalogItem, { ...catalogItem, sku: "S-UNKNOWN", supplierSku: "IDI-X" }],
    });
    expect(res).toMatchObject({ upserted: 1, skipped: 1 });

    const items = await caller.suppliers.list({ supplierId: "sup_1" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ekCents: 590, supplierSku: "IDI-0020" });
  });

  it("PRODUKTION darf EK-Preise nicht importieren (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.suppliers.ingestCatalog({ supplierId: "sup_1", items: [catalogItem] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("PRODUKTION darf die Lieferanten-Artikel nicht lesen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.suppliers.list({ supplierId: "sup_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("tRPC incomingInvoices — E-Rechnung-Empfang + RBAC (C4, Kap. 19/12)", () => {
  const xml = buildEInvoiceXml({
    invoiceNumber: "ER-2026-0001",
    issueDate: new Date(Date.UTC(2026, 5, 10)),
    currency: "EUR",
    seller: { name: "ACME GmbH", vatId: "DE123456789", country: "DE" },
    buyer: { name: "TEXMA GmbH", country: "DE" },
    lines: [{ id: "1", name: "Textil", qty: 10, unitNetCents: 1000, lineNetCents: 10000, vatRatePercent: 19 }],
    netCents: 10000,
    taxCents: 1900,
    grossCents: 11900,
  });

  it("BUCHHALTUNG empfängt eine E-Rechnung und sieht sie in der Liste", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.incomingInvoices.receive({ xml });
    expect(res).toMatchObject({ status: "ERFASST", supplierId: "sup_acme" });

    const list = await caller.incomingInvoices.list();
    expect(list[0]).toMatchObject({ number: "ER-2026-0001", grossCents: 11900 });
  });

  it("PRODUKTION darf keine E-Rechnungen empfangen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.incomingInvoices.receive({ xml })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC shipments — Versand bestätigen + RBAC (C4, T-06)", () => {
  it("BUERO listet versandbereite Aufträge und bestätigt den Versand", async () => {
    const { caller, shipmentRepo } = setup(BUERO);
    const shippable = await caller.shipments.listShippable();
    expect(shippable[0]).toMatchObject({ id: "order_ship", recipient: { city: "Herrenberg" } });

    const res = await caller.shipments.confirmShipped({ orderId: "order_ship", trackingNumber: "DPD123" });
    expect(res).toMatchObject({ orderId: "order_ship", externalNumber: "500", trackingNumber: "DPD123" });
    // Outbox-Event für den Shop-Push wurde eingereiht (VERSENDET + Tracking).
    expect(shipmentRepo.outbox[0]).toMatchObject({
      type: "order.status.update",
      payload: { status: "VERSENDET", trackingNumber: "DPD123", externalNumber: "500" },
    });
  });

  it("PRODUKTION darf den Versand nicht bestätigen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.shipments.confirmShipped({ orderId: "order_ship", trackingNumber: "X" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC banking — CAMT-Abgleich + RBAC (T-13, Kap. 9.4/12)", () => {
  const camt = (ref: string, ustrd: string, amount: string) => `<Document><BkToCstmrStmt><Stmt>
    <Ntry><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-06-15</Dt></ValDt>
      <NtryDtls><TxDtls><Refs><AcctSvcrRef>${ref}</AcctSvcrRef></Refs><RmtInf><Ustrd>${ustrd}</Ustrd></RmtInf></TxDtls></NtryDtls>
    </Ntry></Stmt></BkToCstmrStmt></Document>`;

  it("BUCHHALTUNG importiert einen Auszug: Treffer wird zugeordnet, Unbekanntes in Klärung", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.banking.importStatement({
      xml: camt("REF-1", "Zahlung R-2026-001", "119.00").replace("</Stmt>", "") +
        `<Ntry><Amt Ccy="EUR">42.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-06-15</Dt></ValDt>
         <NtryDtls><TxDtls><Refs><AcctSvcrRef>REF-2</AcctSvcrRef></Refs><RmtInf><Ustrd>ohne Bezug</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry></Stmt></BkToCstmrStmt></Document>`,
    });
    expect(res).toMatchObject({ imported: 2, matched: 1, clarified: 1 });

    const klaerung = await caller.banking.listClarifications();
    expect(klaerung).toHaveLength(1);
    expect(klaerung[0]).toMatchObject({ externalRef: "REF-2", amountCents: 4200 });
  });

  it("ist idempotent: erneuter Import derselben Referenz wird übersprungen", async () => {
    const { caller } = setup(BUCHHALTUNG);
    await caller.banking.importStatement({ xml: camt("REF-1", "R-2026-001", "119.00") });
    const again = await caller.banking.importStatement({ xml: camt("REF-1", "R-2026-001", "119.00") });
    expect(again).toMatchObject({ imported: 0, skipped: 1 });
  });

  it("PRODUKTION darf keinen Kontoauszug importieren (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.banking.importStatement({ xml: camt("REF-1", "R-2026-001", "119.00") })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC dunning — Mahnlauf + RBAC (T-14, Kap. 9.5/12)", () => {
  it("BUCHHALTUNG startet den Mahnlauf: überfälliger Posten → Stufe 1", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const run = await caller.dunning.run({ today: "2026-06-15T00:00:00.000Z" });
    expect(run.proposals).toEqual([
      expect.objectContaining({ itemId: "oi_due", fromLevel: 0, toLevel: 1 }),
    ]);
    const list = await caller.dunning.list();
    expect(list[0]).toMatchObject({ id: "oi_due", dunningLevel: 1 });
  });

  it("PRODUKTION darf keinen Mahnlauf starten (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.dunning.run()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC procurement — Multi-Lieferant-Start-Gate (T-05)", () => {
  it("Start gesperrt, solange nicht alle Lieferanten vollständig eingegangen sind", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const status = await caller.procurement.productionStartStatus({ productionId: "pa_1" });
    expect(status.canStart).toBe(false);
    const ss = status.components.find((c) => c.supplierId === "sup_ss");
    expect(ss).toMatchObject({ requiredQty: 5, receivedQty: 0, complete: false });
  });

  it("ist operativ auch für PRODUKTION sichtbar (keine Preise)", async () => {
    const { caller } = setup(PRODUKTION);
    const status = await caller.procurement.productionStartStatus({ productionId: "pa_1" });
    expect(status.productionId).toBe("pa_1");
    expect(status.canStart).toBe(false);
  });
});

describe("tRPC subproduction — mehrstufige Fremdvergabe (T-04)", () => {
  it("Stufe 2 darf erst starten, wenn Stufe 1 zurück ist", async () => {
    const { caller } = setup(BUERO);
    // Stufe 2 sofort beistellen → blockiert (Stufe 1 noch nicht zurück).
    await expect(
      caller.subproduction.advance({ subProductionId: "sub_2", to: "BEISTELLUNG_VERSANDT" })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Stufe 1 durchlaufen: Beistellung → Rücklauf.
    await caller.subproduction.advance({ subProductionId: "sub_1", to: "BEISTELLUNG_VERSANDT" });
    await caller.subproduction.advance({ subProductionId: "sub_1", to: "RUECKLAUF_ERHALTEN" });

    // Jetzt darf Stufe 2 starten.
    const s2 = await caller.subproduction.advance({ subProductionId: "sub_2", to: "BEISTELLUNG_VERSANDT" });
    expect(s2.status).toBe("BEISTELLUNG_VERSANDT");
  });

  it("weist unerlaubte Statusübergänge ab (CONFLICT)", async () => {
    const { caller } = setup(BUERO);
    // OFFEN → RUECKLAUF_ERHALTEN (ohne Beistellung) ist unzulässig.
    await expect(
      caller.subproduction.advance({ subProductionId: "sub_1", to: "RUECKLAUF_ERHALTEN" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("PRODUKTION darf keine Stufe weiterschalten (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.subproduction.advance({ subProductionId: "sub_1", to: "BEISTELLUNG_VERSANDT" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("erfasst Mengen und liefert einen Plan mit Schwund (T-04-Tiefe)", async () => {
    const { caller } = setup(BUERO);
    await caller.subproduction.advance({ subProductionId: "sub_1", to: "BEISTELLUNG_VERSANDT", menge: 80 });
    await caller.subproduction.advance({ subProductionId: "sub_1", to: "RUECKLAUF_ERHALTEN", menge: 75 });
    const plan = await caller.subproduction.plan({ productionId: "pa_1" });
    expect(plan.totalScrap).toBe(5);
    expect(plan.nextActionable?.sequence).toBe(2);
    expect(plan.progressPercent).toBe(50);
  });

  it("lehnt Rücklauf über die Beistellmenge ab (CONFLICT)", async () => {
    const { caller } = setup(BUERO);
    await caller.subproduction.advance({ subProductionId: "sub_1", to: "BEISTELLUNG_VERSANDT", menge: 50 });
    await expect(
      caller.subproduction.advance({ subProductionId: "sub_1", to: "RUECKLAUF_ERHALTEN", menge: 60 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("tRPC threeWayMatch — Eingangsrechnungsprüfung + RBAC (Kap. 9.6)", () => {
  it("setzt GEPRUEFT bei Übereinstimmung", async () => {
    const { caller, twmRepo } = setup(BUCHHALTUNG);
    const res = await caller.threeWayMatch.verify({ incomingInvoiceId: "iinv_ok", invoicedQty: 10, invoicedUnitCents: 500 });
    expect(res).toMatchObject({ status: "GEPRUEFT", ok: true });
    expect(twmRepo.statusOf("iinv_ok")).toBe("GEPRUEFT");
  });

  it("sperrt (GESPERRT) bei Preisabweichung", async () => {
    const { caller, twmRepo } = setup(BUCHHALTUNG);
    const res = await caller.threeWayMatch.verify({ incomingInvoiceId: "iinv_bad", invoicedQty: 10, invoicedUnitCents: 600 });
    expect(res).toMatchObject({ status: "GESPERRT", ok: false });
    expect(res.variances).toContain("PREIS_ABWEICHUNG");
    expect(twmRepo.statusOf("iinv_bad")).toBe("GESPERRT");
  });

  it("meldet KEINE_BESTELLUNG ohne verknüpfte PO", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.threeWayMatch.verify({ incomingInvoiceId: "iinv_nopo", invoicedQty: 1, invoicedUnitCents: 1 });
    expect(res.status).toBe("KEINE_BESTELLUNG");
  });

  it("PRODUKTION darf nicht prüfen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.threeWayMatch.verify({ incomingInvoiceId: "iinv_ok", invoicedQty: 10, invoicedUnitCents: 500 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC postcalc — Nachkalkulation Soll-Ist + RBAC (T-10, Kap. 12)", () => {
  // Plan: Umsatz 1000 €, Material 350 €, 500 min × 0,80 € = 400 € → DB 250 €.
  const plan = { revenueCents: 100000, materialCents: 35000, laborMinutes: 500, laborRateCentsPerMinute: 80 };

  it("zeigt die DB-Abweichung Ist vs. Plan", async () => {
    const { caller } = setup(BUCHHALTUNG);
    // Ist: Material 400 €, 600 min × 0,80 € = 480 € → DB 120 € → Abweichung −130 €.
    const res = await caller.postcalc.compute({ productionId: "pa_1", plan, istLaborRateCentsPerMinute: 80 });
    expect(res.plan.dbCents).toBe(25000);
    expect(res.ist.dbCents).toBe(12000);
    expect(res.dbVarianceCents).toBe(-13000);
  });

  it("PRODUKTION darf keine Nachkalkulation sehen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.postcalc.compute({ productionId: "pa_1", plan, istLaborRateCentsPerMinute: 80 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC reklamation — Workflow C (Kap. 20)", () => {
  it("legt eine Reklamation an und leitet den Kostenträger aus der Ursache ab", async () => {
    const { caller } = setup(BUERO);
    const res = await caller.reklamation.create({
      orderId: "o1",
      orderLineId: "l1",
      cause: "EXTERN_VEREDLER",
      followUp: "NACHPRODUKTION",
      costCents: 5000,
    });
    expect(res.costBearer).toBe("VEREDLER");
    const list = await caller.reklamation.listByOrder({ orderId: "o1" });
    expect(list[0]).toMatchObject({ cause: "EXTERN_VEREDLER", costBearer: "VEREDLER" });
  });

  it("weist unplausible Kombinationen ab (BAD_REQUEST)", async () => {
    const { caller } = setup(BUERO);
    await expect(
      caller.reklamation.create({ orderId: "o1", orderLineId: "l1", cause: "INTERN", followUp: "NACHPRODUKTION", costCents: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("tRPC ampel — Terminübersicht (Kap. 35.4)", () => {
  it("sortiert überfällige Vorgänge (ROT) nach oben", async () => {
    const { caller } = setup(PRODUKTION); // operativ auch für Produktion
    const rows = await caller.ampel.overview({ today: "2026-06-15T00:00:00.000Z" });
    expect(rows[0]).toMatchObject({ id: "p_late", ampel: "ROT" });
    expect(rows[1]).toMatchObject({ id: "p_ok", ampel: "GRUEN" });
  });
});

describe("tRPC stickerei — Partnerwahl (Kap. 5.4)", () => {
  it("DIREKT bei hinterlegtem Partner + Stickdatei, sonst AUSSCHREIBUNG", async () => {
    const { caller } = setup(BUERO);
    expect((await caller.stickerei.routeForCompany({ companyId: "c_direkt" })).route).toBe("DIREKT");
    expect((await caller.stickerei.routeForCompany({ companyId: "c_neu" })).route).toBe("AUSSCHREIBUNG");
  });

  it("PRODUKTION darf die Partnerwahl nicht abfragen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.stickerei.routeForCompany({ companyId: "c_direkt" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("tRPC reorder — Mindestbestand-Nachbestellung (T-12)", () => {
  it("erzeugt einen Bestellvorschlag je Lieferant aus unterschrittenen Beständen", async () => {
    const { caller } = setup(BUERO);
    const groups = await caller.reorder.proposals();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ supplierId: "sup_id", totalEkCents: 7 * 500 });
    expect(groups[0]?.lines).toEqual([{ variantId: "v1", supplierId: "sup_id", orderQty: 7, ekCents: 500 }]);
  });

  it("macht aus dem Vorschlag eine Bestellung je Lieferant", async () => {
    const { caller, reorderRepo } = setup(BUERO);
    const created = await caller.reorder.createPurchaseOrders();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ supplierId: "sup_id", lineCount: 1 });
    expect(reorderRepo.createdOrders).toEqual([{ supplierId: "sup_id", lines: 1 }]);
  });

  it("PRODUKTION darf keinen Bestellvorschlag sehen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.reorder.proposals()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC productionSheet — Produktionszettel-PDF (T-11)", () => {
  it("erzeugt den externen Zettel als PDF, wenn alle Pflichtfelder befüllt sind", async () => {
    const { caller } = setup(PRODUKTION); // operativ auch für Produktion
    const res = await caller.productionSheet.render({
      productionId: "pa_1",
      kind: "EXTERN",
      extra: {
        dienstleister: "Siebdruck-Partner",
        positionierung: "Brust links",
        anlieferDatum: "2026-06-01T00:00:00.000Z",
        fertigstellDatum: "2026-06-08T00:00:00.000Z",
      },
    });
    expect(res.fileName).toBe("Produktionszettel-AB-1-EXTERN.pdf");
    expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("lehnt einen unvollständigen Zettel ab (BAD_REQUEST mit fehlenden Feldern)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.productionSheet.render({ productionId: "pa_1", kind: "EXTERN", extra: {} })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("tRPC reporting — Auswertungen (Kap. 29)", () => {
  it("liefert die Umsatz-Übersicht je Monat (BUCHHALTUNG)", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.reporting.revenueOverview({ granularity: "MONTH" });
    expect(res.buckets.map((b) => b.key)).toEqual(["2026-05", "2026-06"]);
    expect(res.totalNetCents).toBe(50_000);
  });

  it("schlüsselt den Umsatz nach Shop und Kundengruppe auf", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const byShop = await caller.reporting.revenueByShop();
    expect(byShop[0]).toMatchObject({ name: "Shop A", sharePercent: 60 });
    const byPg = await caller.reporting.revenueByPriceGroup();
    expect(byPg[0]).toMatchObject({ label: "STANDARD", sharePercent: 70 });
  });

  it("schlüsselt den Auftragswert nach Artikel/Position auf", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const byArticle = await caller.reporting.revenueByArticle();
    expect(byArticle[0]).toMatchObject({ name: "Polo / L", netCents: 40_000, sharePercent: 80 });
  });

  it("begrenzt die Umsatz-Übersicht auf den Zeitraum (von–bis)", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.reporting.revenueOverview({ granularity: "MONTH", from: "2026-06-01T00:00:00.000Z" });
    expect(res.buckets.map((b) => b.key)).toEqual(["2026-06"]);
    expect(res.totalNetCents).toBe(30_000);
  });

  it("vergleicht Umsatz aktueller Monat vs. Vormonat", async () => {
    const { caller } = setup(BUERO);
    const cmp = await caller.reporting.compareRevenue({
      granularity: "MONTH",
      reference: "2026-06-19T00:00:00.000Z",
    });
    expect(cmp.current.netCents).toBe(30_000);
    expect(cmp.previous?.netCents).toBe(20_000);
    expect(cmp.deltaPercent).toBe(50);
  });

  it("liefert eine KI-/Heuristik-Zusammenfassung", async () => {
    const { caller } = setup(BUERO);
    const res = await caller.reporting.aiSummary({
      granularity: "MONTH",
      reference: "2026-06-19T00:00:00.000Z",
    });
    expect(res.narrative.length).toBeGreaterThan(0);
    expect(typeof res.aiGenerated).toBe("boolean");
  });

  it("exportiert die Umsatz-Auswertung als PDF (base64)", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.reporting.exportPdf({ granularity: "MONTH" });
    expect(res.fileName).toBe("Umsatz-Auswertung-MONTH.pdf");
    expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("exportiert den kombinierten Gesamtbericht als PDF (Umsatz + KPIs)", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const res = await caller.reporting.exportFullPdf({ granularity: "MONTH" });
    expect(res.fileName).toBe("Gesamtbericht-MONTH.pdf");
    expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("verweigert PRODUKTION den Zugriff (FORBIDDEN, Finanzdaten)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.reporting.revenueOverview({ granularity: "MONTH" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.reporting.exportPdf({ granularity: "MONTH" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC productionReporting — operative KPIs (Kap. 29/35)", () => {
  it("liefert PRODUKTION die Durchlaufzeit (operativ, kein FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    const res = await caller.productionReporting.leadTime({ granularity: "MONTH" });
    expect(res.stats).toMatchObject({ count: 2, minHours: 24, maxHours: 72 });
    expect(res.buckets[0]).toMatchObject({ key: "2026-06", count: 2, avgHours: 48 });
  });

  it("liefert PRODUKTION die Fehlerquote samt Ursachen", async () => {
    const { caller } = setup(PRODUKTION);
    const res = await caller.productionReporting.defects({ granularity: "MONTH" });
    expect(res.overall).toEqual({ total: 2, defects: 1, ratePercent: 50 });
    expect(res.byCause.INTERN).toBe(1);
  });

  it("liefert PRODUKTION die Termintreue (On-Time-Quote)", async () => {
    const { caller } = setup(PRODUKTION);
    const res = await caller.productionReporting.onTime({ granularity: "MONTH" });
    expect(res.overall).toEqual({ total: 2, onTime: 1, ratePercent: 50 });
  });

  it("erfordert eine Anmeldung (UNAUTHORIZED ohne Session)", async () => {
    const { caller } = setup(null);
    await expect(
      caller.productionReporting.leadTime({ granularity: "MONTH" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
