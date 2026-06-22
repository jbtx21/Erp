// Fastify + tRPC Server (Produktionspfad). Verdrahtet Prisma-Repositories, Auth
// (Session-Cookie + RBAC) und die GoBD-Audit-Senke.

import cookie from "@fastify/cookie";
import {
  type CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaAuditSink } from "./audit/prisma-audit-sink.js";
import { AuthService, type AuthUser } from "./modules/auth/auth.service.js";
import { JoseOidcVerifier, type IdentityVerifier } from "./modules/auth/oidc.js";
import { Argon2Hasher } from "./modules/auth/password.js";
import { OtpauthTotpService } from "./modules/auth/totp.js";
import { OrderImportService } from "./modules/shop-import/order-import.service.js";
import { SupplierImportService } from "./modules/supplier-import/supplier-import.service.js";
import { IncomingInvoiceService } from "./modules/incoming-invoice/incoming-invoice.service.js";
import { ShipmentService } from "./modules/shipment/shipment.service.js";
import { BankingImportService } from "./modules/banking/banking-import.service.js";
import { BankConnectionService } from "./modules/banking/bank-connection.service.js";
import { InMemoryFinApiClient } from "./repositories/in-memory-finapi-client.js";
import { PrismaBankConnectionRepository } from "./repositories/prisma-bank-connection.repository.js";
import { DunningService } from "./modules/dunning/dunning.service.js";
import { ProcurementService } from "./modules/procurement/procurement.service.js";
import { SubProductionService } from "./modules/subproduction/subproduction.service.js";
import { ThreeWayMatchService } from "./modules/three-way-match/three-way-match.service.js";
import { PostCalcService } from "./modules/postcalc/postcalc.service.js";
import { ReklamationService } from "./modules/reklamation/reklamation.service.js";
import { NumberingService } from "./modules/numbering/numbering.service.js";
import { PrismaNumberingRepository } from "./repositories/prisma-numbering.repository.js";
import { AmpelService } from "./modules/ampel/ampel.service.js";
import { StickereiService } from "./modules/stickerei/stickerei.service.js";
import { ReorderService } from "./modules/reorder/reorder.service.js";
import { ProductionSheetService } from "./modules/production-sheet/production-sheet.service.js";
import { ReportingService } from "./modules/reporting/reporting.service.js";
import { AnthropicReportClient } from "./modules/reporting/anthropic-report-client.js";
import { ProductionReportingService } from "./modules/production-reporting/production-reporting.service.js";
import { PrismaSessionRepository, PrismaUserRepository } from "./repositories/prisma-auth.repository.js";
import { PrismaOrderRepository } from "./repositories/prisma-order.repository.js";
import { PrismaSupplierRepository } from "./repositories/prisma-supplier.repository.js";
import { PrismaIncomingInvoiceRepository } from "./repositories/prisma-incoming-invoice.repository.js";
import { PrismaShipmentRepository } from "./repositories/prisma-shipment.repository.js";
import { PrismaBankingRepository } from "./repositories/prisma-banking.repository.js";
import { PrismaDunningRepository } from "./repositories/prisma-dunning.repository.js";
import { PrismaProcurementRepository } from "./repositories/prisma-procurement.repository.js";
import { PrismaSubProductionRepository } from "./repositories/prisma-subproduction.repository.js";
import { PrismaThreeWayMatchRepository } from "./repositories/prisma-three-way-match.repository.js";
import { PrismaPostCalcRepository } from "./repositories/prisma-postcalc.repository.js";
import { PrismaReklamationRepository } from "./repositories/prisma-reklamation.repository.js";
import { PrismaAmpelRepository } from "./repositories/prisma-ampel.repository.js";
import { PrismaStickereiRepository } from "./repositories/prisma-stickerei.repository.js";
import { PrismaReorderRepository } from "./repositories/prisma-reorder.repository.js";
import { PrismaProductionSheetRepository } from "./repositories/prisma-production-sheet.repository.js";
import { PrismaReportingRepository } from "./repositories/prisma-reporting.repository.js";
import { PrismaProductionReportingRepository } from "./repositories/prisma-production-reporting.repository.js";
import { CostCenterService } from "./modules/cost-center/cost-center.service.js";
import { PrismaCostCenterRepository } from "./repositories/prisma-cost-center.repository.js";
import { LeadService } from "./modules/lead/lead.service.js";
import { PrismaLeadRepository } from "./repositories/prisma-lead.repository.js";
import { InquiryService } from "./modules/inquiry/inquiry.service.js";
import { PrismaInquiryRepository } from "./repositories/prisma-inquiry.repository.js";
import { SampleLoanService } from "./modules/sample/sample.service.js";
import { PrismaSampleLoanRepository } from "./repositories/prisma-sample.repository.js";
import { CompanyService } from "./modules/company/company.service.js";
import { PrismaCompanyRepository } from "./repositories/prisma-company.repository.js";
import { ProductService } from "./modules/product/product.service.js";
import { PrismaProductRepository } from "./repositories/prisma-product.repository.js";
import { OrderWorkflowService } from "./modules/order-workflow/order-workflow.service.js";
import { QuoteService } from "./modules/quote/quote.service.js";
import { PrismaQuoteRepository } from "./repositories/prisma-quote.repository.js";
import { PricingService } from "./modules/pricing/pricing.service.js";
import { PrismaPricingRepository } from "./repositories/prisma-pricing.repository.js";
import { CollaborationService } from "./modules/collaboration/collaboration.service.js";
import { PrismaCollaborationRepository } from "./repositories/prisma-collaboration.repository.js";
import { SearchService } from "./modules/search/search.service.js";
import { PrismaSearchRepository } from "./repositories/prisma-search.repository.js";
import { NotificationService, EmailTemplateService } from "./modules/notification/notification.service.js";
import { PrismaNotificationRepository, PrismaEmailTemplateRepository } from "./repositories/prisma-notification.repository.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";
import { PrismaDashboardRepository, PrismaMetricRepository } from "./repositories/prisma-dashboard.repository.js";
import { DeliveryService } from "./modules/delivery/delivery.service.js";
import { PrismaDeliveryRepository } from "./repositories/prisma-delivery.repository.js";
import { LinksService } from "./modules/links/links.service.js";
import { PrismaLinksRepository } from "./repositories/prisma-links.repository.js";
import { DataIoService } from "./modules/dataio/dataio.service.js";
import { PrismaDataIoRepository } from "./repositories/prisma-dataio.repository.js";
import { PrintService } from "./modules/print/print.service.js";
import { PrismaPrintRepository } from "./repositories/prisma-print.repository.js";
import { SalesOrderService } from "./modules/sales/sales-order.service.js";
import { PrismaSalesOrderRepository } from "./repositories/prisma-sales-order.repository.js";
import { MailIntakeService } from "./modules/mail/mail.service.js";
import { PrismaMailIntakeRepository } from "./repositories/prisma-mail.repository.js";
import { ImapMailFetcher } from "./modules/mail/imap-fetcher.js";
import { appRouter } from "./trpc/router.js";
import type { Context } from "./trpc/trpc.js";
import { portalAppRouter } from "./trpc/portal-router.js";
import type { PortalContext } from "./trpc/portal-trpc.js";
import { PortalAuthService } from "./modules/portal/portal-auth.service.js";
import { CustomerPortalService } from "./modules/portal/portal.service.js";
import { PrismaPortalUserRepository, PrismaPortalSessionRepository } from "./repositories/prisma-portal-auth.repository.js";
import { PrismaPortalRepository } from "./repositories/prisma-portal.repository.js";

const COOKIE_NAME = "sid";
const PORTAL_COOKIE_NAME = "portal_sid";
const secure = process.env.NODE_ENV === "production";

export interface ServerOptions {
  /** Überschreibt den OIDC-Verifier (Tests); sonst aus der Umgebung (OIDC_*). */
  identityVerifier?: IdentityVerifier | null;
  /** Demo/Durchstich: erzwingt einen authentifizierten Nutzer ohne Login (kein Prod). */
  demoUser?: AuthUser | null;
  /** Demo/Durchstich: ersetzt einzelne Context-Services (z. B. In-Memory-Repos). */
  contextOverrides?: Partial<Context>;
}

export function buildServer(opts: ServerOptions = {}): FastifyInstance {
  // bodyLimit großzügig: Logo-/Stickdatei-Uploads (≤ 10 MB) reisen base64-kodiert (~+33 %).
  const server = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });
  void server.register(cookie);

  const repo = new PrismaOrderRepository();
  const orderImport = new OrderImportService(repo, new PrismaAuditSink());
  const supplierRepo = new PrismaSupplierRepository();
  const supplierImport = new SupplierImportService(supplierRepo, new PrismaAuditSink());
  const incomingInvoiceRepo = new PrismaIncomingInvoiceRepository();
  const incomingInvoiceImport = new IncomingInvoiceService(incomingInvoiceRepo, new PrismaAuditSink());
  const shipments = new ShipmentService(new PrismaShipmentRepository(), new PrismaAuditSink());
  const bankingRepo = new PrismaBankingRepository();
  const bankingImport = new BankingImportService(bankingRepo, new PrismaAuditSink());
  // Bank-Anbindung (Kap. 9): EBICS/PSD2 hinter einer Abstraktion. Der FinApiClient ist hier
  // ein In-Memory-Stand-in — der echte finAPI-/EBICS-HTTP-Client wird per Env konfiguriert.
  const bankConnections = new BankConnectionService(
    new PrismaBankConnectionRepository(),
    new InMemoryFinApiClient(),
    bankingImport,
    new PrismaAuditSink()
  );
  const dunningRepo = new PrismaDunningRepository();
  const dunning = new DunningService(dunningRepo, new PrismaAuditSink());
  const procurement = new ProcurementService(new PrismaProcurementRepository());
  const subproduction = new SubProductionService(new PrismaSubProductionRepository(), new PrismaAuditSink());
  const threeWayMatch = new ThreeWayMatchService(new PrismaThreeWayMatchRepository(), new PrismaAuditSink());
  const postcalc = new PostCalcService(new PrismaPostCalcRepository());
  const reklamation = new ReklamationService(
    new PrismaReklamationRepository(),
    new PrismaAuditSink(),
    new NumberingService(new PrismaNumberingRepository())
  );
  const ampel = new AmpelService(new PrismaAmpelRepository());
  const stickerei = new StickereiService(new PrismaStickereiRepository());
  const reorder = new ReorderService(new PrismaReorderRepository(), new PrismaAuditSink());
  const productionSheet = new ProductionSheetService(new PrismaProductionSheetRepository());
  // KI-Reporting nutzt Claude nur, wenn ein API-Schlüssel hinterlegt ist (sonst Heuristik).
  const reporting = new ReportingService(new PrismaReportingRepository(), AnthropicReportClient.fromEnv());
  const productionReporting = new ProductionReportingService(new PrismaProductionReportingRepository());
  const costCenters = new CostCenterService(new PrismaCostCenterRepository(), new PrismaAuditSink());
  const leads = new LeadService(new PrismaLeadRepository(), new PrismaAuditSink());
  const inquiries = new InquiryService(
    new PrismaInquiryRepository(),
    new NumberingService(new PrismaNumberingRepository()),
    new PrismaAuditSink()
  );
  const sampleLoans = new SampleLoanService(
    new PrismaSampleLoanRepository(),
    new NumberingService(new PrismaNumberingRepository()),
    new PrismaAuditSink()
  );
  const companies = new CompanyService(new PrismaCompanyRepository(), new PrismaAuditSink());
  const products = new ProductService(new PrismaProductRepository(), new PrismaAuditSink());
  const orderWorkflow = new OrderWorkflowService(repo, new PrismaAuditSink());
  const quotes = new QuoteService(
    new PrismaQuoteRepository(),
    new NumberingService(new PrismaNumberingRepository()),
    new PrismaAuditSink()
  );
  const pricing = new PricingService(new PrismaPricingRepository(), new PrismaAuditSink());
  const collaboration = new CollaborationService(new PrismaCollaborationRepository(), new PrismaAuditSink());
  const search = new SearchService(new PrismaSearchRepository());
  const notifications = new NotificationService(new PrismaNotificationRepository());
  const emailTemplates = new EmailTemplateService(new PrismaEmailTemplateRepository());
  const dashboards = new DashboardService(new PrismaDashboardRepository(), new PrismaMetricRepository());
  const deliveries = new DeliveryService(new PrismaDeliveryRepository(), new PrismaAuditSink());
  const links = new LinksService(new PrismaLinksRepository());
  const dataIo = new DataIoService(new PrismaDataIoRepository(), new PrismaAuditSink());
  const print = new PrintService(new PrismaPrintRepository());
  const salesOrders = new SalesOrderService(new PrismaSalesOrderRepository(), new NumberingService(new PrismaNumberingRepository()), new PrismaAuditSink());
  const mailIntake = new MailIntakeService(new ImapMailFetcher(), new PrismaMailIntakeRepository(), new NumberingService(new PrismaNumberingRepository()), new PrismaAuditSink());
  const auth = new AuthService(
    new PrismaUserRepository(),
    new PrismaSessionRepository(),
    new PrismaAuditSink(),
    new Argon2Hasher(),
    new OtpauthTotpService()
  );
  // Kundenportal (B13): EIGENER Auth-Pfad/Service, getrennt vom Mitarbeiter-`auth`.
  const portalAuth = new PortalAuthService(
    new PrismaPortalUserRepository(),
    new PrismaPortalSessionRepository(),
    new Argon2Hasher(),
    new PrismaAuditSink()
  );
  const portal = new CustomerPortalService(new PrismaPortalRepository());

  // Sicherheits-Maxime (Leitplanke 2): primär externe OIDC-Identität, wenn konfiguriert.
  // Der selbstgebaute Session-Pfad bleibt nur als Fallback (Dev/Übergang) bestehen.
  const oidc = opts.identityVerifier !== undefined ? opts.identityVerifier : JoseOidcVerifier.fromEnv();

  server.get("/health", async () => ({ ok: true }));

  // Binär-Download/Preview der hochgeladenen Stickdatei (außerhalb von tRPC, da Bytes).
  // Nutzt denselben Stickerei-Service wie der Context (inkl. Demo-Override) und ist über
  // die Session-Cookie abgesichert (gleiche Identität wie die App).
  const stickereiSvc = (opts.contextOverrides?.stickerei as StickereiService | undefined) ?? stickerei;
  server.get<{ Params: { id: string } }>("/logos/:id/file", async (req, reply) => {
    const token = req.cookies[COOKIE_NAME] ?? null;
    let user = token ? await auth.resolveSession(token) : null;
    if (!user && opts.demoUser) user = opts.demoUser;
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    const file = await stickereiSvc.getLogoFile(req.params.id);
    if (!file) return reply.code(404).send({ error: "not found" });
    return reply
      .header("content-type", file.mimeType || "application/octet-stream")
      .header("content-disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`)
      .send(file.data);
  });

  void server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req, res }: CreateFastifyContextOptions): Promise<Context> => {
        const sessionToken = req.cookies[COOKIE_NAME] ?? null;
        // Bevorzugt: vom Identity-Provider ausgestelltes Bearer-Token (OIDC, jose-verifiziert).
        // Fallback: selbstgebaute Cookie-Session (Übergang bis zur vollständigen Ablösung).
        const authz = req.headers.authorization;
        let user = null;
        if (oidc && authz?.startsWith("Bearer ")) {
          try {
            user = await oidc.verify(authz.slice("Bearer ".length));
          } catch {
            user = null;
          }
        }
        if (!user && sessionToken) {
          user = await auth.resolveSession(sessionToken);
        }
        // Demo/Durchstich: ohne echte Identität einen festen Nutzer setzen (nur wenn gesetzt).
        if (!user && opts.demoUser) user = opts.demoUser;
        return {
          orderImport,
          orders: repo,
          supplierImport,
          suppliers: supplierRepo,
          incomingInvoiceImport,
          incomingInvoices: incomingInvoiceRepo,
          shipments,
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
          reporting,
          productionReporting,
          costCenters,
          leads,
          inquiries,
          sampleLoans,
          companies,
          products,
          orderWorkflow,
          quotes,
          pricing,
          collaboration,
          search,
          notifications,
          emailTemplates,
          dashboards,
          deliveries,
          links,
          dataIo,
          print,
          salesOrders,
          mailIntake,
          auth,
          user,
          sessionToken,
          setSessionCookie: (token, maxAgeSeconds) =>
            void res.setCookie(COOKIE_NAME, token, {
              httpOnly: true,
              sameSite: "lax",
              secure,
              path: "/",
              maxAge: maxAgeSeconds,
            }),
          clearSessionCookie: () => void res.clearCookie(COOKIE_NAME, { path: "/" }),
          // Demo/Durchstich: ausgewählte Services überschreiben (In-Memory statt Prisma).
          ...(opts.contextOverrides ?? {}),
        };
      },
    },
  });

  // Kundenportal-API: isolierter Router unter /portal/trpc mit eigenem Cookie
  // (Pfad /portal → wird nicht an die Mitarbeiter-App gesendet). Principal/companyId
  // ausschließlich aus der Portal-Session.
  void server.register(fastifyTRPCPlugin, {
    prefix: "/portal/trpc",
    trpcOptions: {
      router: portalAppRouter,
      createContext: async ({ req, res }: CreateFastifyContextOptions): Promise<PortalContext> => {
        const sessionToken = req.cookies[PORTAL_COOKIE_NAME] ?? null;
        const principal = sessionToken ? await portalAuth.resolve(sessionToken) : null;
        return {
          portalAuth,
          portal,
          principal,
          sessionToken,
          setSessionCookie: (token, maxAgeSeconds) =>
            void res.setCookie(PORTAL_COOKIE_NAME, token, {
              httpOnly: true,
              sameSite: "lax",
              secure,
              path: "/portal",
              maxAge: maxAgeSeconds,
            }),
          clearSessionCookie: () => void res.clearCookie(PORTAL_COOKIE_NAME, { path: "/portal" }),
        };
      },
    },
  });

  return server;
}
