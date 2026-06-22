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
