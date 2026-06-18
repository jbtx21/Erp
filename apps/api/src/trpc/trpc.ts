// tRPC-Basis (v11): Kontext + Procedure-Builder.
import { initTRPC } from "@trpc/server";
import type { OrderImportService } from "../modules/shop-import/order-import.service.js";
import type { OrderQueryRepository } from "../repositories/read.js";

/** Pro Request injizierte Abhängigkeiten — in Tests durch In-Memory-Varianten ersetzbar. */
export interface Context {
  orderImport: OrderImportService;
  orders: OrderQueryRepository;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
