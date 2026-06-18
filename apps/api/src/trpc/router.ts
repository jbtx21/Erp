// tRPC-AppRouter — erster vertikaler Slice: Shop-Order-Ingest (T-01) + Liste.
import { z } from "zod";
import { publicProcedure, router } from "./trpc.js";

export const appRouter = router({
  shopOrders: router({
    /** Importiert eine rohe WooCommerce-Bestellung (T-01: Bindung an die Firma). */
    ingest: publicProcedure
      .input(
        z.object({
          raw: z.unknown(),
          shopConnectorId: z.string().min(1),
          companyId: z.string().min(1),
          deliveryAddressPolicy: z
            .enum(["FEST", "FREIE_EINGABE", "AUSWAHL"])
            .optional(),
        })
      )
      .mutation(async ({ input, ctx }) =>
        ctx.orderImport.importWooOrder(input.raw, {
          shopConnectorId: input.shopConnectorId,
          companyId: input.companyId,
          deliveryAddressPolicy: input.deliveryAddressPolicy,
        })
      ),

    /** Liefert die zuletzt importierten Aufträge (für die Auftragsliste in apps/web). */
    list: publicProcedure
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => ctx.orders.listRecent(input?.limit ?? 50)),
  }),
});

export type AppRouter = typeof appRouter;
