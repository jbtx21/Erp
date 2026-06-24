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
import { CostCenterService } from "../modules/cost-center/cost-center.service.js";
import { InMemoryCostCenterRepository } from "../repositories/in-memory-cost-center.repository.js";
import { LeadService } from "../modules/lead/lead.service.js";
import { InMemoryLeadRepository } from "../repositories/in-memory-lead.repository.js";
import { CallLogService } from "../modules/call-log/call-log.service.js";
import { InMemoryCallLogRepository } from "../repositories/in-memory-call-log.repository.js";
import { MailAccountService } from "../modules/mail/mail-account.service.js";
import { InMemoryMailAccountRepository } from "../repositories/in-memory-mail-account.repository.js";
import { ReservationService } from "../modules/stock/reservation.service.js";
import { InMemoryReservationRepository } from "../repositories/in-memory-reservation.repository.js";
import { InquiryService } from "../modules/inquiry/inquiry.service.js";
import { InMemoryInquiryRepository } from "../repositories/in-memory-inquiry.repository.js";
import { SampleLoanService } from "../modules/sample/sample.service.js";
import { InMemorySampleLoanRepository } from "../repositories/in-memory-sample.repository.js";
import { CompanyService } from "../modules/company/company.service.js";
import { InMemoryCompanyRepository } from "../repositories/in-memory-company.repository.js";
import { ProductService } from "../modules/product/product.service.js";
import { InMemoryProductRepository } from "../repositories/in-memory-product.repository.js";
import { OrderWorkflowService } from "../modules/order-workflow/order-workflow.service.js";
import { QuoteService } from "../modules/quote/quote.service.js";
import { InMemoryQuoteRepository } from "../repositories/in-memory-quote.repository.js";
import { PricingService } from "../modules/pricing/pricing.service.js";
import { InMemoryPricingRepository } from "../repositories/in-memory-pricing.repository.js";
import { CollaborationService } from "../modules/collaboration/collaboration.service.js";
import { InMemoryCollaborationRepository } from "../repositories/in-memory-collaboration.repository.js";
import { SearchService } from "../modules/search/search.service.js";
import { InMemorySearchRepository } from "../repositories/in-memory-search.repository.js";
import { NotificationService, EmailTemplateService } from "../modules/notification/notification.service.js";
import { InMemoryNotificationRepository, InMemoryEmailTemplateRepository } from "../repositories/in-memory-notification.repository.js";
import { DashboardService } from "../modules/dashboard/dashboard.service.js";
import { InMemoryDashboardRepository, FakeMetricRepository } from "../repositories/in-memory-dashboard.repository.js";
import { LinksService } from "../modules/links/links.service.js";
import { InMemoryLinksRepository } from "../repositories/in-memory-links.repository.js";
import { DataIoService } from "../modules/dataio/dataio.service.js";
import { InMemoryDataIoRepository } from "../repositories/in-memory-dataio.repository.js";
import { PrintService } from "../modules/print/print.service.js";
import { InMemoryPrintRepository } from "../repositories/in-memory-print.repository.js";
import { SalesOrderService } from "../modules/sales/sales-order.service.js";
import { InMemorySalesOrderRepository } from "../repositories/in-memory-sales-order.repository.js";
import { MailIntakeService, MailSendService, LoggingMailSender } from "../modules/mail/mail.service.js";
import { InMemoryMailFetcher, InMemoryMailIntakeRepository } from "../repositories/in-memory-mail.repository.js";
import { NewsletterService, StubNewsletterProvider } from "../modules/newsletter/newsletter.service.js";
import { InMemoryNewsletterRepository } from "../repositories/in-memory-newsletter.repository.js";
import { OpportunityService, StubCrmProvider } from "../modules/opportunity/opportunity.service.js";
import { InMemoryOpportunityRepository } from "../repositories/in-memory-opportunity.repository.js";
import { CalendarService } from "../modules/calendar/calendar.service.js";
import { InMemoryCalendarRepository } from "../repositories/in-memory-calendar.repository.js";
import { MessageService } from "../modules/messages/messages.service.js";
import { InMemoryMessageRepository } from "../repositories/in-memory-messages.repository.js";
import { WorkflowService } from "../modules/workflow/workflow.service.js";
import { InMemoryWorkflowRepository } from "../repositories/in-memory-workflow.repository.js";
import { SettingsService } from "../modules/settings/settings.service.js";
import { InMemorySettingsRepository } from "../repositories/in-memory-settings.repository.js";
import { StockService } from "../modules/stock/stock.service.js";
import { InMemoryStockRepository } from "../repositories/in-memory-stock.repository.js";
import { InventoryService } from "../modules/inventory/inventory.service.js";
import { HrService } from "../modules/hr/hr.service.js";
import { InMemoryHrRepository } from "../repositories/in-memory-hr.repository.js";
import { IntegrationsService, LoggingSlackSender } from "../modules/integrations/integrations.service.js";
import { InMemoryIntegrationsRepository } from "../repositories/in-memory-integrations.repository.js";
import { ArchiveService } from "../modules/archive/archive.service.js";
import { InMemoryObjectStore } from "../modules/archive/object-store.js";
import { InMemoryArchiveRepository } from "../repositories/in-memory-archive.repository.js";
import { InvoiceService } from "../modules/invoice/invoice.service.js";
import { InMemoryInvoiceRepository } from "../repositories/in-memory-invoice.repository.js";
import { ConnectionsService } from "../modules/connections/connections.service.js";
import { InMemoryConnectionsRepository } from "../repositories/in-memory-connections.repository.js";
import { ContactLinkService } from "../modules/contact/contact-link.service.js";
import { InMemoryContactLinkRepository } from "../repositories/in-memory-contact-link.repository.js";
import { AutomationService } from "../modules/automation/automation.service.js";
import { InMemoryAutomationRepository } from "../repositories/in-memory-automation.repository.js";
import { TaskService } from "../modules/task/task.service.js";
import { InMemoryTaskRepository } from "../repositories/in-memory-task.repository.js";
import { PreferencesService } from "../modules/preferences/preferences.service.js";
import { InMemoryUserPreferenceRepository } from "../repositories/in-memory-user-preference.repository.js";
import { AuditQueryService } from "../modules/audit-log/audit-query.service.js";
import { InMemoryAuditLogRepository } from "../repositories/in-memory-audit-log.repository.js";
import { EanImportService } from "../modules/ean-import/ean-import.service.js";
import { InMemoryEanImportRepository } from "../repositories/in-memory-ean-import.repository.js";
import { FinanceReportService } from "../modules/finance-report/finance-report.service.js";
import { InMemoryFinanceReportRepository } from "../repositories/in-memory-finance-report.repository.js";
import { GoodsReceiptService } from "../modules/goods-receipt/goods-receipt.service.js";
import { InMemoryGoodsReceiptRepository } from "../repositories/in-memory-goods-receipt.repository.js";
import { PaymentService } from "../modules/payment/payment.service.js";
import { InMemoryPaymentRepository } from "../repositories/in-memory-payment.repository.js";
import { DeliveryService } from "../modules/delivery/delivery.service.js";
import { InMemoryDeliveryRepository } from "../repositories/in-memory-delivery.repository.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../repositories/in-memory-numbering.repository.js";
import { ProductionSheetService } from "../modules/production-sheet/production-sheet.service.js";
import { ProductionService } from "../modules/production/production.service.js";
import { ReportingService } from "../modules/reporting/reporting.service.js";
import { ProductionReportingService } from "../modules/production-reporting/production-reporting.service.js";
import { InMemoryOrderRepository } from "../repositories/in-memory-order.repository.js";
import { InMemorySupplierRepository } from "../repositories/in-memory-supplier.repository.js";
import { InMemoryIncomingInvoiceRepository } from "../repositories/in-memory-incoming-invoice.repository.js";
import { InMemoryShipmentRepository } from "../repositories/in-memory-shipment.repository.js";
import { InMemoryBankingRepository } from "../repositories/in-memory-banking.repository.js";
import { BankConnectionService } from "../modules/banking/bank-connection.service.js";
import { InMemoryBankConnectionRepository } from "../repositories/in-memory-bank-connection.repository.js";
import { InMemoryFinApiClient } from "../repositories/in-memory-finapi-client.js";
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
import { InMemoryProductionRepository } from "../repositories/in-memory-production.repository.js";
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
  const bankConnections = new BankConnectionService(
    new InMemoryBankConnectionRepository({
      connections: [
        { id: "conn-ebics", name: "Hausbank (EBICS)", kind: "EBICS", iban: "DE89370400440532013000", bic: "COBADEFFXXX", debtorName: "TEXMA GmbH", consentValidUntil: null, lastSyncAt: null, createdAt: new Date("2026-06-01T00:00:00Z") },
      ],
    }),
    new InMemoryFinApiClient({ creditsByConnection: { "conn-ebics": [{ externalRef: "EB-1", reference: "R-2026-001", amountCents: 11900 }] } }),
    bankingImport,
    new MemoryAuditSink()
  );
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
    new InMemoryStickereiRepository(
      {
        c_direkt: { stickereiPartnerId: "sup_stick", hatStickdatei: true },
        c_neu: { stickereiPartnerId: null, hatStickdatei: false },
      },
      { "logo-x": [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 600 }] },
      { logos: [{ id: "logo-x", label: "Muster GmbH · v1 (aktiv)", version: 1, active: true }] }
    )
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
  const production = new ProductionService(new InMemoryProductionRepository(), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink());
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
    orderStatusSync: { onStatusChanged: async () => undefined } as unknown as Context["orderStatusSync"],
    warehouses: { list: async () => [], create: async () => ({}), setActive: async () => undefined } as unknown as Context["warehouses"],
    bankingImport,
    banking: bankingRepo,
    bankConnections,
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
    production,
    reporting,
    productionReporting,
    costCenters: new CostCenterService(new InMemoryCostCenterRepository(), new MemoryAuditSink()),
    leads: new LeadService(new InMemoryLeadRepository(), new MemoryAuditSink()),
    callLogs: new CallLogService(new InMemoryCallLogRepository(), new MemoryAuditSink()),
    mailAccounts: new MailAccountService(new InMemoryMailAccountRepository(), null),
    reservations: new ReservationService(new InMemoryReservationRepository(), { balance: async () => ({ HAUPT: 0, MUSTER: 0, SHOWROOM: 0, TRANSFERDRUCK: 0 }), listBalances: async () => [] }),
    inquiries: new InquiryService(new InMemoryInquiryRepository(), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink()),
    sampleLoans: new SampleLoanService(new InMemorySampleLoanRepository(), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink()),
    companies: new CompanyService(new InMemoryCompanyRepository(), new MemoryAuditSink()),
    products: new ProductService(new InMemoryProductRepository(), new MemoryAuditSink()),
    orderWorkflow: new OrderWorkflowService(repo, new MemoryAuditSink()),
    quotes: new QuoteService(new InMemoryQuoteRepository(), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink()),
    pricing: new PricingService(new InMemoryPricingRepository(), new MemoryAuditSink()),
    collaboration: new CollaborationService(new InMemoryCollaborationRepository(), new MemoryAuditSink()),
    search: new SearchService(new InMemorySearchRepository()),
    notifications: new NotificationService(new InMemoryNotificationRepository()),
    emailTemplates: new EmailTemplateService(new InMemoryEmailTemplateRepository()),
    dashboards: new DashboardService(new InMemoryDashboardRepository(), new FakeMetricRepository()),
    deliveries: new DeliveryService(new InMemoryDeliveryRepository(), new MemoryAuditSink()),
    links: new LinksService(new InMemoryLinksRepository()),
    dataIo: new DataIoService(new InMemoryDataIoRepository(), new MemoryAuditSink()),
    print: new PrintService(new InMemoryPrintRepository()),
    salesOrders: new SalesOrderService(new InMemorySalesOrderRepository(["company_acme"]), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink()),
    mailIntake: new MailIntakeService(new InMemoryMailFetcher(), new InMemoryMailIntakeRepository(), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink()),
    mailSend: new MailSendService(new LoggingMailSender()),
    newsletter: new NewsletterService(new InMemoryNewsletterRepository(), new StubNewsletterProvider(), new MemoryAuditSink()),
    opportunities: new OpportunityService(new InMemoryOpportunityRepository(), new MemoryAuditSink(), new StubCrmProvider()),
    calendar: new CalendarService(new InMemoryCalendarRepository(), new MemoryAuditSink()),
    messages: new MessageService(new InMemoryMessageRepository(), new MemoryAuditSink()),
    workflow: new WorkflowService(new InMemoryWorkflowRepository(), new MemoryAuditSink()),
    settings: new SettingsService(new InMemorySettingsRepository(), new MemoryAuditSink()),
    stock: new StockService(new InMemoryStockRepository(), new MemoryAuditSink()),
    inventory: new InventoryService(new StockService(new InMemoryStockRepository(), new MemoryAuditSink())),
    hr: new HrService(new InMemoryHrRepository(), new MemoryAuditSink()),
    integrations: new IntegrationsService(new InMemoryIntegrationsRepository(), new MemoryAuditSink(), new LoggingSlackSender()),
    archive: new ArchiveService(new InMemoryObjectStore(), new InMemoryArchiveRepository(), new MemoryAuditSink()),
    invoices: new InvoiceService(new InMemoryInvoiceRepository([]), new NumberingService(new InMemoryNumberingRepository()), new MemoryAuditSink()),
    connections: new ConnectionsService(new InMemoryConnectionsRepository({})),
    contactLinks: new ContactLinkService(new InMemoryContactLinkRepository([]), new MemoryAuditSink()),
    automation: new AutomationService(new InMemoryAutomationRepository(), { notify: async () => undefined }, new MemoryAuditSink()),
    tasks: new TaskService(new InMemoryTaskRepository(), new MemoryAuditSink()),
    preferences: new PreferencesService(new InMemoryUserPreferenceRepository()),
    auditLog: new AuditQueryService(new InMemoryAuditLogRepository()),
    eanImport: new EanImportService(new InMemoryEanImportRepository(), new MemoryAuditSink()),
    financeReport: new FinanceReportService(new InMemoryFinanceReportRepository()),
    goodsReceipts: new GoodsReceiptService(new InMemoryGoodsReceiptRepository(), new MemoryAuditSink()),
    payments: new PaymentService(new InMemoryPaymentRepository(), new MemoryAuditSink()),
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
      orderStatusSync: {} as Context["orderStatusSync"],
      warehouses: {} as Context["warehouses"],
      bankingImport: {} as Context["bankingImport"],
      banking: buero.bankingRepo,
      bankConnections: {} as Context["bankConnections"],
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
      production: {} as Context["production"],
      reporting: {} as Context["reporting"],
      productionReporting: {} as Context["productionReporting"],
      costCenters: {} as Context["costCenters"],
      leads: {} as Context["leads"],
      callLogs: {} as Context["callLogs"],
      mailAccounts: {} as Context["mailAccounts"],
      reservations: {} as Context["reservations"],
      inquiries: {} as Context["inquiries"],
      sampleLoans: {} as Context["sampleLoans"],
      companies: {} as Context["companies"],
      products: {} as Context["products"],
      orderWorkflow: {} as Context["orderWorkflow"],
      quotes: {} as Context["quotes"],
      pricing: {} as Context["pricing"],
      collaboration: {} as Context["collaboration"],
      search: {} as Context["search"],
      notifications: {} as Context["notifications"],
      emailTemplates: {} as Context["emailTemplates"],
      dashboards: {} as Context["dashboards"],
      deliveries: {} as Context["deliveries"],
      links: {} as Context["links"],
      dataIo: {} as Context["dataIo"],
      print: {} as Context["print"],
      salesOrders: {} as Context["salesOrders"],
      mailIntake: {} as Context["mailIntake"],
      mailSend: {} as Context["mailSend"],
      newsletter: {} as Context["newsletter"],
      opportunities: {} as Context["opportunities"],
      calendar: {} as Context["calendar"],
      messages: {} as Context["messages"],
      workflow: {} as Context["workflow"],
      settings: {} as Context["settings"],
      stock: {} as Context["stock"],
      inventory: {} as Context["inventory"],
      hr: {} as Context["hr"],
      integrations: {} as Context["integrations"],
      archive: {} as Context["archive"],
      invoices: {} as Context["invoices"],
      connections: {} as Context["connections"],
      contactLinks: {} as Context["contactLinks"],
      automation: {} as Context["automation"],
      tasks: {} as Context["tasks"],
      preferences: {} as Context["preferences"],
      auditLog: {} as Context["auditLog"],
      eanImport: {} as Context["eanImport"],
      financeReport: {} as Context["financeReport"],
      goodsReceipts: {} as Context["goodsReceipts"],
      payments: {} as Context["payments"],
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

  it("banking.connections: Liste mit Consent + EBICS-Sync (AIS) speist Pipeline", async () => {
    const { caller } = setup(BUERO);
    const conns = await caller.banking.connections.list();
    expect(conns.find((c) => c.id === "conn-ebics")?.consent.ok).toBe(true);
    const res = await caller.banking.connections.sync({ connectionId: "conn-ebics" });
    expect(res.result).toMatchObject({ imported: 1, matched: 1 });
  });

  it("banking.payments: SEPA-Auftrag anlegen + einreichen (PIS) → EXECUTED", async () => {
    const { caller } = setup(BUERO);
    const order = await caller.banking.payments.create({
      connectionId: "conn-ebics",
      requestedExecutionDate: "2026-06-22",
      transfers: [{ creditorName: "Garn & Co", creditorIban: "DE02120300000000202051", amountCents: 5_000, remittance: "ER-1" }],
    });
    expect(order).toMatchObject({ status: "DRAFT", totalCents: 5_000 });
    const submitted = await caller.banking.payments.submit({ orderId: order.id });
    expect(submitted.status).toBe("EXECUTED");
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

  it("zeigt die DB-Abweichung, Zerlegung und Ampel Ist vs. Plan", async () => {
    const { caller } = setup(BUCHHALTUNG);
    // Ist: Material 400 €, 600 min × 0,80 € = 480 € → DB 120 € → Abweichung −130 €.
    const res = await caller.postcalc.compute({ productionId: "pa_1", plan, istLaborRateCentsPerMinute: 80 });
    expect(res.plan.dbCents).toBe(25000);
    expect(res.ist.dbCents).toBe(12000);
    expect(res.dbVarianceCents).toBe(-13000);
    // Zerlegung: Material −5.000, Lohn-Menge (500−600)×80 = −8.000, Satz 0, Umsatz 0.
    expect(res.variance.materialVarianceCents).toBe(-5000);
    expect(res.variance.laborQtyVarianceCents).toBe(-8000);
    // 52 % unter Plan-DB → ROT; DB-Marge wird ausgewiesen.
    expect(res.status).toBe("ROT");
    expect(res.planMarginPct).toBe(25);
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

  it("PRODUKTION darf keinen Folgevorgang auslösen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.reklamation.executeFollowUp({ complaintId: "c1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC ampel — Terminübersicht (Kap. 35.4)", () => {
  it("sortiert überfällige Vorgänge (ROT) nach oben", async () => {
    const { caller } = setup(PRODUKTION); // operativ auch für Produktion
    const rows = await caller.ampel.overview({ today: "2026-06-15T00:00:00.000Z" });
    expect(rows[0]).toMatchObject({ id: "p_late", ampel: "ROT" });
    expect(rows[1]).toMatchObject({ id: "p_ok", ampel: "GRUEN" });
  });

  it("liefert die Dashboard-Verdichtung (Zählungen + Eskalation)", async () => {
    const { caller } = setup(PRODUKTION);
    const sum = await caller.ampel.summary({ today: "2026-06-15T00:00:00.000Z" });
    expect(sum).toMatchObject({ total: 2, rot: 1, gruen: 1, overdue: 1, kritisch: 1 });
    expect(sum.mostUrgent?.id).toBe("p_late");
    expect(sum.byLevel.PRODUKTION.rot).toBe(1);
  });
});

describe("tRPC stickerei — Partnerwahl (Kap. 5.4)", () => {
  it("DIREKT bei hinterlegtem Partner + Stickdatei, sonst AUSSCHREIBUNG", async () => {
    const { caller } = setup(BUERO);
    expect((await caller.stickerei.routeForCompany({ companyId: "c_direkt" })).route).toBe("DIREKT");
    expect((await caller.stickerei.routeForCompany({ companyId: "c_neu" })).route).toBe("AUSSCHREIBUNG");
  });

  it("Mengenstaffeln je Logo: speichern, listen (VK = EK × 1,88) und Mengenpreis", async () => {
    const { caller } = setup(BUERO);
    const saved = await caller.stickerei.staffeln.save({
      logoVersionId: "logo-x",
      staffeln: [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 600 }],
    });
    expect(saved.staffeln[0]).toMatchObject({ ekCents: 1_000, vkCents: 1_880 });

    const list = await caller.stickerei.staffeln.list({ logoVersionId: "logo-x" });
    expect(list.staffeln.map((s) => s.minMenge)).toEqual([1, 50]);

    const price = await caller.stickerei.staffeln.priceForMenge({ logoVersionId: "logo-x", menge: 75 });
    expect(price).toMatchObject({ minMenge: 50, ekCents: 600, vkCents: 1_128 });
  });

  it("Logo-Picker: listet die verfügbaren Logos", async () => {
    const { caller } = setup(BUERO);
    const logos = await caller.stickerei.logos.list();
    expect(logos).toEqual([{ id: "logo-x", label: "Muster GmbH · v1 (aktiv)", version: 1, active: true }]);
  });

  it("Aufschlagsfaktor: Konfig-Roundtrip (Standard + Regel)", async () => {
    const { caller } = setup(BUERO);
    await caller.stickerei.markup.saveConfig({
      defaultFactor: 1.88,
      rules: [{ factor: 2.1, finishingType: "STICKEREI", maxMenge: 9, label: "Kleinmenge" }],
    });
    const cfg = await caller.stickerei.markup.getConfig();
    expect(cfg.defaultFactor).toBe(1.88);
    expect(cfg.rules[0]).toMatchObject({ factor: 2.1, maxMenge: 9, finishingType: "STICKEREI" });
  });

  it("Logo-Override beim Speichern gewinnt über den Standardfaktor", async () => {
    const { caller } = setup(BUERO);
    const saved = await caller.stickerei.staffeln.save({
      logoVersionId: "logo-x",
      staffeln: [{ minMenge: 1, ekCents: 1_000 }],
      logoOverride: 2.0,
    });
    expect(saved.logoOverride).toBe(2.0);
    expect(saved.staffeln[0]?.vkCents).toBe(2_000); // 1000 × 2,0
  });

  it("PRODUKTION darf weder Partnerwahl noch Staffeln abfragen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.stickerei.routeForCompany({ companyId: "c_direkt" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.stickerei.staffeln.list({ logoVersionId: "logo-x" })).rejects.toMatchObject({
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

describe("tRPC archive — GoBD-Belegarchiv (Kap. 10)", () => {
  const b64 = (s: string) => Buffer.from(s).toString("base64");

  it("archiviert einen Beleg und liest ihn wieder (BUERO)", async () => {
    const { caller } = setup();
    const meta = await caller.archive.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-9", fileName: "re.pdf", contentType: "application/pdf", dataBase64: b64("inhalt") });
    expect(meta.version).toBe(1);
    const got = await caller.archive.get({ id: meta.id });
    expect(Buffer.from(got.dataBase64, "base64").toString()).toBe("inhalt");
  });

  it("GoBD-Export liefert index.xml + manifest.csv (BUCHHALTUNG)", async () => {
    const { caller } = setup(BUCHHALTUNG);
    await caller.archive.archive({ belegart: "ANGEBOT", sourceEntity: "Quote", sourceId: "AN-9", fileName: "an.pdf", contentType: "application/pdf", dataBase64: b64("x") });
    const exp = await caller.archive.gobdExport();
    expect(exp.count).toBe(1);
    expect(exp.indexXml).toContain("gdpdu-01-09-2004.dtd");
  });

  it("PRODUKTION darf nicht archivieren (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.archive.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "x", contentType: "application/pdf", dataBase64: b64("y") })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("nur ADMIN/BUCHHALTUNG dürfen den GoBD-Export ziehen (BUERO → FORBIDDEN)", async () => {
    const { caller } = setup();
    await expect(caller.archive.gobdExport()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC invoices — Order → Invoice Make-Target", () => {
  it("PRODUKTION darf nicht fakturieren (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.invoices.createFromOrder({ orderId: "o1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("unbekannter Auftrag → BAD_REQUEST", async () => {
    const { caller } = setup();
    await expect(caller.invoices.createFromOrder({ orderId: "nope" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("tRPC tasks — Aufgaben/Zuweisung", () => {
  it("BUERO legt eine Aufgabe an und findet sie in der eigenen Arbeitsliste", async () => {
    const { caller } = setup(); // BUERO = b@texma.de
    await caller.tasks.create({ title: "Druckdaten prüfen", assigneeEmail: "b@texma.de", entity: "Order", entityId: "o1", navKey: "orders" });
    const mine = await caller.tasks.mine();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Druckdaten prüfen", status: "OFFEN" });
    expect(await caller.tasks.openCount()).toBe(1);
  });

  it("Erledigen nimmt die Aufgabe aus der offenen Liste", async () => {
    const { caller } = setup();
    const t = await caller.tasks.create({ title: "x", assigneeEmail: "b@texma.de" });
    await caller.tasks.complete({ id: t.id });
    expect(await caller.tasks.mine()).toHaveLength(0);
    expect(await caller.tasks.openCount()).toBe(0);
  });

  it("erfordert eine Anmeldung (UNAUTHORIZED)", async () => {
    const { caller } = setup(null);
    await expect(caller.tasks.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("tRPC auditLog — GoBD-Protokoll nur für Admin", () => {
  const ADMIN: AuthUser = { id: "u0", email: "admin@texma.de", name: "Admin", role: "ADMIN", totpEnabled: false };

  it("ADMIN darf das Protokoll lesen", async () => {
    const { caller } = setup(ADMIN);
    expect(await caller.auditLog.list()).toEqual([]);
    expect(await caller.auditLog.entities()).toEqual([]);
  });

  it("BUERO darf das Protokoll nicht lesen (FORBIDDEN)", async () => {
    const { caller } = setup(BUERO);
    await expect(caller.auditLog.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("PRODUKTION darf das Protokoll nicht lesen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.auditLog.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC eanImport — Massenimport mit EAN-Abgleich", () => {
  const csv = ["EAN;Artikelnummer;Bezeichnung", "4006381333931;POLO-1;Polo"].join("\n");

  it("BUERO erhält eine Abgleich-Vorschau", async () => {
    const { caller } = setup(BUERO);
    const plan = await caller.eanImport.preview({ csv });
    expect(plan.counts.total).toBe(1);
  });

  it("PRODUKTION darf nicht importieren (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.eanImport.preview({ csv })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC financeReport — OP-Aging/DSO nur für nicht-PRODUKTION", () => {
  it("BUCHHALTUNG erhält das OP-Aging", async () => {
    const { caller } = setup(BUCHHALTUNG);
    const r = await caller.financeReport.aging();
    expect(r).toHaveProperty("total");
    expect(r).toHaveProperty("d90plus");
  });

  it("PRODUKTION darf das Finanz-Reporting nicht lesen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.financeReport.aging()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC goodsReceipts — Wareneingang gegen Bestellung (T-05)", () => {
  it("BUERO darf offene Bestellungen lesen", async () => {
    const { caller } = setup(BUERO);
    expect(await caller.goodsReceipts.listOpen()).toEqual([]);
  });

  it("PRODUKTION darf keinen Wareneingang buchen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.goodsReceipts.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 5 }] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tRPC payments — manuelle Zahlungserfassung (Kap. 9.4)", () => {
  it("BUCHHALTUNG darf offene Posten lesen", async () => {
    const { caller } = setup(BUCHHALTUNG);
    expect(await caller.payments.listOpen()).toEqual([]);
  });

  it("PRODUKTION darf keine Zahlung erfassen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.payments.record({ openItemId: "oi1", amountCents: 5000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
