// tRPC-AppRouter: Auth (Login/2FA/RBAC) + Shop-Order-Ingest/Liste.
import { TRPCError } from "@trpc/server";
import { redactOrderForRole } from "@texma/shared";
import { z } from "zod";
import { AuthError, SESSION_TTL_SECONDS } from "../modules/auth/auth.service.js";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./trpc.js";

// EK-Preise sind finanziell sensibel → kein PRODUKTION-Zugriff (Kap. 12, C3).
const supplierRoles = ["ADMIN", "BUERO", "BUCHHALTUNG"] as const;

const supplierCatalogItem = z.object({
  supplierSku: z.string().min(1),
  sku: z.string().min(1),
  ekCents: z.number().int(),
  availableQty: z.number().int().nonnegative().nullable(),
});

function toTrpcError(err: unknown): never {
  if (err instanceof AuthError) {
    const code = err.code === "LOCKED" ? "TOO_MANY_REQUESTS" : "UNAUTHORIZED";
    throw new TRPCError({ code, message: err.message });
  }
  throw err;
}

export const appRouter = router({
  auth: router({
    /** Schritt 1: Passwort. Setzt das Session-Cookie (auch bei offener 2FA). */
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const res = await ctx.auth.loginWithPassword(input.email, input.password);
          ctx.setSessionCookie(res.token, SESSION_TTL_SECONDS);
          return { needsTotp: res.needsTotp };
        } catch (err) {
          toTrpcError(err);
        }
      }),

    /** Schritt 2: TOTP-Code (nutzt die Cookie-Session). */
    verifyTotp: publicProcedure
      .input(z.object({ code: z.string().min(6).max(8) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Keine Sitzung." });
        try {
          await ctx.auth.verifyTotp(ctx.sessionToken, input.code);
          return { ok: true };
        } catch (err) {
          toTrpcError(err);
        }
      }),

    me: protectedProcedure.query(({ ctx }) => ctx.user),

    logout: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.sessionToken) await ctx.auth.logout(ctx.sessionToken);
      ctx.clearSessionCookie();
      return { ok: true };
    }),

    /** 2FA-Enrollment: liefert Secret + otpauth-URI (für QR im Authenticator). */
    setupTotp: protectedProcedure.mutation(async ({ ctx }) => ctx.auth.setupTotp(ctx.user.id)),

    enableTotp: protectedProcedure
      .input(z.object({ code: z.string().min(6).max(8) }))
      .mutation(async ({ input, ctx }) => {
        try {
          await ctx.auth.enableTotp(ctx.user.id, input.code);
          return { ok: true };
        } catch (err) {
          toTrpcError(err);
        }
      }),
  }),

  shopOrders: router({
    /** Importiert eine rohe WooCommerce-Bestellung (T-01: Bindung an die Firma). */
    ingest: protectedProcedure
      .input(
        z.object({
          raw: z.unknown(),
          shopConnectorId: z.string().min(1),
          companyId: z.string().min(1),
          deliveryAddressPolicy: z.enum(["FEST", "FREIE_EINGABE", "AUSWAHL"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) =>
        ctx.orderImport.importWooOrder(input.raw, {
          shopConnectorId: input.shopConnectorId,
          companyId: input.companyId,
          deliveryAddressPolicy: input.deliveryAddressPolicy,
        })
      ),

    /** Auftragsliste — Preis-/Kundenfelder werden für PRODUKTION redigiert (RBAC, Kap. 12). */
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => {
        const items = await ctx.orders.listRecent(input?.limit ?? 50);
        return items.map((item) => redactOrderForRole(item, ctx.user.role));
      }),
  }),

  suppliers: router({
    /** Importiert einen Lieferanten-Katalog (Kap. 6 / C3): EK-Preise, Bestand, Lieferanten-SKU. */
    ingestCatalog: roleProcedure(...supplierRoles)
      .input(
        z.object({
          supplierId: z.string().min(1),
          items: z.array(supplierCatalogItem),
        })
      )
      .mutation(async ({ input, ctx }) =>
        ctx.supplierImport.ingestCatalog(input.supplierId, input.items)
      ),

    /** Lieferanten-Artikel mit EK-Preisen (rollen­geschützt, kein PRODUKTION-Zugriff). */
    list: roleProcedure(...supplierRoles)
      .input(z.object({ supplierId: z.string().min(1), limit: z.number().int().positive().max(500).optional() }))
      .query(async ({ input, ctx }) => ctx.suppliers.listItems(input.supplierId, input.limit ?? 100)),
  }),

  incomingInvoices: router({
    /** Empfängt eine eingehende E-Rechnung (CII-XML), validiert + erfasst sie (Kap. 19/K-13). */
    receive: roleProcedure(...supplierRoles)
      .input(z.object({ xml: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => ctx.incomingInvoiceImport.receive(input.xml)),

    /** Liste der erfassten Eingangsrechnungen (Finanzdaten, kein PRODUKTION-Zugriff). */
    list: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => ctx.incomingInvoices.listRecent(input?.limit ?? 50)),
  }),

  shipments: router({
    /** Versandbereite Aufträge (mit Lieferadresse) für den DPD-Label-Worker (T-06). */
    listShippable: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => ctx.shipments.listShippable(input?.limit ?? 50)),

    /** Bestätigt den Versand: Auftrag → VERSENDET, Tracking gespeichert, Shop-Push eingereiht. */
    confirmShipped: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1), trackingNumber: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => ctx.shipments.confirmShipped(input)),
  }),

  banking: router({
    /** Importiert einen CAMT.053-Kontoauszug und gleicht Zahlungen gegen OPs ab (T-13). */
    importStatement: roleProcedure(...supplierRoles)
      .input(z.object({ xml: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => ctx.bankingImport.importStatement(input.xml)),

    /** Klärungsliste: nicht (voll) zugeordnete Zahlungseingänge (Kap. 9.4). */
    listClarifications: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => ctx.banking.listClarifications(input?.limit ?? 50)),
  }),

  dunning: router({
    /** Startet den Mahnlauf: überfällige, nicht gesperrte Posten +1 Stufe (T-14). */
    run: roleProcedure(...supplierRoles)
      .input(z.object({ today: z.string().datetime().optional() }).optional())
      .mutation(async ({ input, ctx }) =>
        ctx.dunning.runDunning(input?.today ? new Date(input.today) : new Date())
      ),

    /** Mahnübersicht: offene Posten mit Mahnstufe + Sperre (Kap. 9.5). */
    list: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => ctx.dunningQuery.listDunning(input?.limit ?? 50)),
  }),

  procurement: router({
    /** Produktionsstart-Gate (T-05): Komponentenstatus + canStart (operativ, keine Preise). */
    productionStartStatus: protectedProcedure
      .input(z.object({ productionId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.procurement.productionStartStatus(input.productionId)),
  }),
});

export type AppRouter = typeof appRouter;
