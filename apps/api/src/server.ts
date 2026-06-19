// Fastify + tRPC Server (Produktionspfad). Verdrahtet Prisma-Repositories, Auth
// (Session-Cookie + RBAC) und die GoBD-Audit-Senke.

import cookie from "@fastify/cookie";
import {
  type CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaAuditSink } from "./audit/prisma-audit-sink.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { Argon2Hasher } from "./modules/auth/password.js";
import { OtpauthTotpService } from "./modules/auth/totp.js";
import { OrderImportService } from "./modules/shop-import/order-import.service.js";
import { SupplierImportService } from "./modules/supplier-import/supplier-import.service.js";
import { IncomingInvoiceService } from "./modules/incoming-invoice/incoming-invoice.service.js";
import { ShipmentService } from "./modules/shipment/shipment.service.js";
import { BankingImportService } from "./modules/banking/banking-import.service.js";
import { DunningService } from "./modules/dunning/dunning.service.js";
import { ProcurementService } from "./modules/procurement/procurement.service.js";
import { SubProductionService } from "./modules/subproduction/subproduction.service.js";
import { ThreeWayMatchService } from "./modules/three-way-match/three-way-match.service.js";
import { PostCalcService } from "./modules/postcalc/postcalc.service.js";
import { ReklamationService } from "./modules/reklamation/reklamation.service.js";
import { AmpelService } from "./modules/ampel/ampel.service.js";
import { StickereiService } from "./modules/stickerei/stickerei.service.js";
import { ReorderService } from "./modules/reorder/reorder.service.js";
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
import { appRouter } from "./trpc/router.js";
import type { Context } from "./trpc/trpc.js";

const COOKIE_NAME = "sid";
const secure = process.env.NODE_ENV === "production";

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });
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
  const dunningRepo = new PrismaDunningRepository();
  const dunning = new DunningService(dunningRepo, new PrismaAuditSink());
  const procurement = new ProcurementService(new PrismaProcurementRepository());
  const subproduction = new SubProductionService(new PrismaSubProductionRepository(), new PrismaAuditSink());
  const threeWayMatch = new ThreeWayMatchService(new PrismaThreeWayMatchRepository(), new PrismaAuditSink());
  const postcalc = new PostCalcService(new PrismaPostCalcRepository());
  const reklamation = new ReklamationService(new PrismaReklamationRepository(), new PrismaAuditSink());
  const ampel = new AmpelService(new PrismaAmpelRepository());
  const stickerei = new StickereiService(new PrismaStickereiRepository());
  const reorder = new ReorderService(new PrismaReorderRepository(), new PrismaAuditSink());
  const auth = new AuthService(
    new PrismaUserRepository(),
    new PrismaSessionRepository(),
    new PrismaAuditSink(),
    new Argon2Hasher(),
    new OtpauthTotpService()
  );

  server.get("/health", async () => ({ ok: true }));

  void server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req, res }: CreateFastifyContextOptions): Promise<Context> => {
        const sessionToken = req.cookies[COOKIE_NAME] ?? null;
        const user = sessionToken ? await auth.resolveSession(sessionToken) : null;
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
        };
      },
    },
  });

  return server;
}
