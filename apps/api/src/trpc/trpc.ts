// tRPC-Basis (v11): Kontext, Auth-Middleware, Procedure-Builder.
import { initTRPC, TRPCError } from "@trpc/server";
import type { Role } from "@texma/shared";
import type { AuthService, AuthUser } from "../modules/auth/auth.service.js";
import type { OrderImportService } from "../modules/shop-import/order-import.service.js";
import type { SupplierImportService } from "../modules/supplier-import/supplier-import.service.js";
import type { IncomingInvoiceService } from "../modules/incoming-invoice/incoming-invoice.service.js";
import type { ShipmentService } from "../modules/shipment/shipment.service.js";
import type { BankingImportService } from "../modules/banking/banking-import.service.js";
import type { BankConnectionService } from "../modules/banking/bank-connection.service.js";
import type { DunningService } from "../modules/dunning/dunning.service.js";
import type { ProcurementService } from "../modules/procurement/procurement.service.js";
import type { SubProductionService } from "../modules/subproduction/subproduction.service.js";
import type { ThreeWayMatchService } from "../modules/three-way-match/three-way-match.service.js";
import type { PostCalcService } from "../modules/postcalc/postcalc.service.js";
import type { ReklamationService } from "../modules/reklamation/reklamation.service.js";
import type { AmpelService } from "../modules/ampel/ampel.service.js";
import type { StickereiService } from "../modules/stickerei/stickerei.service.js";
import type { ReorderService } from "../modules/reorder/reorder.service.js";
import type { ProductionSheetService } from "../modules/production-sheet/production-sheet.service.js";
import type { ReportingService } from "../modules/reporting/reporting.service.js";
import type { ProductionReportingService } from "../modules/production-reporting/production-reporting.service.js";
import type { CostCenterService } from "../modules/cost-center/cost-center.service.js";
import type { LeadService } from "../modules/lead/lead.service.js";
import type { InquiryService } from "../modules/inquiry/inquiry.service.js";
import type { SampleLoanService } from "../modules/sample/sample.service.js";
import type { CompanyService } from "../modules/company/company.service.js";
import type { ProductService } from "../modules/product/product.service.js";
import type { OrderWorkflowService } from "../modules/order-workflow/order-workflow.service.js";
import type { QuoteService } from "../modules/quote/quote.service.js";
import type { PricingService } from "../modules/pricing/pricing.service.js";
import type { CollaborationService } from "../modules/collaboration/collaboration.service.js";
import type { SearchService } from "../modules/search/search.service.js";
import type { NotificationService, EmailTemplateService } from "../modules/notification/notification.service.js";
import type { DashboardService } from "../modules/dashboard/dashboard.service.js";
import type { DeliveryService } from "../modules/delivery/delivery.service.js";
import type { LinksService } from "../modules/links/links.service.js";
import type { DataIoService } from "../modules/dataio/dataio.service.js";
import type { PrintService } from "../modules/print/print.service.js";
import type { SalesOrderService } from "../modules/sales/sales-order.service.js";
import type { MailIntakeService, MailSendService } from "../modules/mail/mail.service.js";
import type { NewsletterService } from "../modules/newsletter/newsletter.service.js";
import type { OpportunityService } from "../modules/opportunity/opportunity.service.js";
import type { CalendarService } from "../modules/calendar/calendar.service.js";
import type { MessageService } from "../modules/messages/messages.service.js";
import type { WorkflowService } from "../modules/workflow/workflow.service.js";
import type { SettingsService } from "../modules/settings/settings.service.js";
import type { StockService } from "../modules/stock/stock.service.js";
import type { InventoryService } from "../modules/inventory/inventory.service.js";
import type { HrService } from "../modules/hr/hr.service.js";
import type { IntegrationsService } from "../modules/integrations/integrations.service.js";
import type { ArchiveService } from "../modules/archive/archive.service.js";
import type {
  BankingQueryRepository,
  DunningQueryRepository,
  IncomingInvoiceQueryRepository,
  OrderQueryRepository,
  SupplierQueryRepository,
} from "../repositories/read.js";

/** Pro Request injizierte Abhängigkeiten — in Tests durch In-Memory-Varianten ersetzbar. */
export interface Context {
  orderImport: OrderImportService;
  orders: OrderQueryRepository;
  supplierImport: SupplierImportService;
  suppliers: SupplierQueryRepository;
  incomingInvoiceImport: IncomingInvoiceService;
  incomingInvoices: IncomingInvoiceQueryRepository;
  shipments: ShipmentService;
  bankingImport: BankingImportService;
  banking: BankingQueryRepository;
  bankConnections: BankConnectionService;
  dunning: DunningService;
  dunningQuery: DunningQueryRepository;
  procurement: ProcurementService;
  subproduction: SubProductionService;
  threeWayMatch: ThreeWayMatchService;
  postcalc: PostCalcService;
  reklamation: ReklamationService;
  ampel: AmpelService;
  stickerei: StickereiService;
  reorder: ReorderService;
  productionSheet: ProductionSheetService;
  reporting: ReportingService;
  productionReporting: ProductionReportingService;
  costCenters: CostCenterService;
  leads: LeadService;
  inquiries: InquiryService;
  sampleLoans: SampleLoanService;
  companies: CompanyService;
  products: ProductService;
  orderWorkflow: OrderWorkflowService;
  quotes: QuoteService;
  pricing: PricingService;
  collaboration: CollaborationService;
  search: SearchService;
  notifications: NotificationService;
  emailTemplates: EmailTemplateService;
  dashboards: DashboardService;
  deliveries: DeliveryService;
  links: LinksService;
  dataIo: DataIoService;
  print: PrintService;
  salesOrders: SalesOrderService;
  mailIntake: MailIntakeService;
  mailSend: MailSendService;
  newsletter: NewsletterService;
  opportunities: OpportunityService;
  calendar: CalendarService;
  messages: MessageService;
  workflow: WorkflowService;
  settings: SettingsService;
  stock: StockService;
  inventory: InventoryService;
  hr: HrService;
  integrations: IntegrationsService;
  archive: ArchiveService;
  auth: AuthService;
  user: AuthUser | null;
  /** Roh-Token aus dem Cookie (für den 2FA-Zwischenschritt/Logout, wenn user noch null ist). */
  sessionToken: string | null;
  setSessionCookie: (token: string, maxAgeSeconds: number) => void;
  clearSessionCookie: () => void;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Erzwingt eine authentifizierte Sitzung; verengt ctx.user auf non-null. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Anmeldung erforderlich." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Rollenbasierte Procedure (RBAC, Kap. 12). */
export function roleProcedure(...roles: Role[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
    }
    return next();
  });
}
