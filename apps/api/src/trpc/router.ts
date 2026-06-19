// tRPC-AppRouter: Auth (Login/2FA/RBAC) + Shop-Order-Ingest/Liste.
import { TRPCError } from "@trpc/server";
import { ProductionSheetIncompleteError, redactOrderForRole, SubProductionTransitionError } from "@texma/shared";
import { ReklamationValidationError } from "../modules/reklamation/reklamation.service.js";
import { z } from "zod";
import { AuthError, SESSION_TTL_SECONDS } from "../modules/auth/auth.service.js";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./trpc.js";

// EK-Preise sind finanziell sensibel → kein PRODUKTION-Zugriff (Kap. 12, C3).
const supplierRoles = ["ADMIN", "BUERO", "BUCHHALTUNG"] as const;

// Zeitliche Granularität für Auswertungen (Kap. 29).
const granularityEnum = z.enum(["DAY", "WEEK", "MONTH", "YEAR"]);

// Optionaler Auswertungszeitraum (von–bis) als ISO-Strings.
const rangeShape = { from: z.string().datetime().optional(), to: z.string().datetime().optional() };
function toRange(input: { from?: string; to?: string }): { from?: Date; to?: Date } | undefined {
  if (!input.from && !input.to) return undefined;
  return {
    ...(input.from ? { from: new Date(input.from) } : {}),
    ...(input.to ? { to: new Date(input.to) } : {}),
  };
}

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

  subproduction: router({
    /** Schaltet eine Fremdvergabe-Stufe weiter (Beistellung/Rücklauf/Abschluss, T-04). */
    advance: roleProcedure("ADMIN", "BUERO")
      .input(
        z.object({
          subProductionId: z.string().min(1),
          to: z.enum(["BEISTELLUNG_VERSANDT", "RUECKLAUF_ERHALTEN", "ABGESCHLOSSEN"]),
          at: z.string().datetime().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.subproduction.advanceStage(
            input.subProductionId,
            input.to,
            input.at ? new Date(input.at) : new Date()
          );
        } catch (err) {
          if (err instanceof SubProductionTransitionError) {
            throw new TRPCError({ code: "CONFLICT", message: err.message });
          }
          throw err;
        }
      }),

    /** Fremdvergabe-Übersicht je PA: Stufen + allReturned (operativ). */
    list: protectedProcedure
      .input(z.object({ productionId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.subproduction.productionSubStatus(input.productionId)),
  }),

  threeWayMatch: router({
    /** Prüft eine Eingangsrechnung gegen Bestellung + Wareneingang (Kap. 9.6). */
    verify: roleProcedure(...supplierRoles)
      .input(
        z.object({
          incomingInvoiceId: z.string().min(1),
          invoicedQty: z.number().int().positive(),
          invoicedUnitCents: z.number().int().nonnegative(),
          tolerance: z
            .object({ qtyTolerance: z.number().int().nonnegative(), priceToleranceCents: z.number().int().nonnegative() })
            .optional(),
        })
      )
      .mutation(async ({ input, ctx }) => ctx.threeWayMatch.verify(input)),
  }),

  postcalc: router({
    /** Nachkalkulation Soll-Ist je PA (T-10): Plan-DB vs. Ist-DB (Material + Lohn). */
    compute: roleProcedure(...supplierRoles)
      .input(
        z.object({
          productionId: z.string().min(1),
          plan: z.object({
            revenueCents: z.number().int(),
            materialCents: z.number().int().nonnegative(),
            laborMinutes: z.number().int().nonnegative(),
            laborRateCentsPerMinute: z.number().int().nonnegative(),
          }),
          istLaborRateCentsPerMinute: z.number().int().nonnegative(),
        })
      )
      .query(async ({ input, ctx }) => ctx.postcalc.compute(input)),
  }),

  reklamation: router({
    /** Legt eine Kundenreklamation an (Workflow C, Kap. 20); Ursache → Kostenträger. */
    create: roleProcedure(...supplierRoles)
      .input(
        z.object({
          orderId: z.string().min(1),
          orderLineId: z.string().min(1),
          cause: z.enum(["LIEFERANT", "INTERN", "EXTERN_VEREDLER"]),
          followUp: z.enum(["NACHPRODUKTION", "EXPRESS_NACHPRODUKTION", "GUTSCHRIFT", "KEINE"]),
          costCents: z.number().int().nonnegative(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.reklamation.create(input);
        } catch (err) {
          if (err instanceof ReklamationValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          throw err;
        }
      }),

    /** Reklamationshistorie je Auftrag (Kap. 20/29). */
    listByOrder: roleProcedure(...supplierRoles)
      .input(z.object({ orderId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
      .query(async ({ input, ctx }) => ctx.reklamation.listByOrder(input.orderId, input.limit ?? 50)),
  }),

  ampel: router({
    /** Ebenenübergreifende Terminübersicht (Kap. 35.4): ROT zuerst (operativ). */
    overview: protectedProcedure
      .input(z.object({ today: z.string().datetime().optional() }).optional())
      .query(async ({ input, ctx }) =>
        ctx.ampel.overview(input?.today ? new Date(input.today) : new Date())
      ),
  }),

  stickerei: router({
    /** Stickerei-Weg einer Firma (Kap. 5.4): DIREKT vs. AUSSCHREIBUNG. */
    routeForCompany: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ companyId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.stickerei.routeForCompany(input.companyId)),
  }),

  reorder: router({
    /** Bestellvorschlag je Lieferant aus unterschrittenen Mindestbeständen (T-12). */
    proposals: roleProcedure(...supplierRoles).query(async ({ ctx }) => ctx.reorder.proposals()),

    /** Erzeugt aus dem Vorschlag je Lieferant eine Bestellung (Kap. 6.1). */
    createPurchaseOrders: roleProcedure("ADMIN", "BUERO").mutation(async ({ ctx }) =>
      ctx.reorder.createPurchaseOrders()
    ),
  }),

  reporting: router({
    /** Umsatz-Übersicht (Netto je Tag/Woche/Monat/Jahr) + Gesamtsumme (Kap. 29). */
    revenueOverview: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, ...rangeShape }))
      .query(async ({ input, ctx }) => ctx.reporting.revenueOverview(input.granularity, toRange(input))),

    /** Auftrags-Übersicht (Anzahl + Auftragswert je Periode) + Gesamtsummen (Kap. 29). */
    orderOverview: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, ...rangeShape }))
      .query(async ({ input, ctx }) => ctx.reporting.orderOverview(input.granularity, toRange(input))),

    /** Umsatz nach Shop aufgeschlüsselt (Kap. 29). */
    revenueByShop: roleProcedure(...supplierRoles)
      .input(z.object({ ...rangeShape }).optional())
      .query(async ({ input, ctx }) => ctx.reporting.revenueByShop(toRange(input ?? {}))),

    /** Umsatz nach Kundengruppe (Preisgruppe) aufgeschlüsselt (Kap. 29). */
    revenueByPriceGroup: roleProcedure(...supplierRoles)
      .input(z.object({ ...rangeShape }).optional())
      .query(async ({ input, ctx }) => ctx.reporting.revenueByPriceGroup(toRange(input ?? {}))),

    /** Auftragswert nach Artikel/Veredelungsart (Position) aufgeschlüsselt (Kap. 29). */
    revenueByArticle: roleProcedure(...supplierRoles)
      .input(z.object({ ...rangeShape }).optional())
      .query(async ({ input, ctx }) => ctx.reporting.revenueByArticle(toRange(input ?? {}))),

    /** Periodenvergleich Umsatz: aktuell vs. Vorperiode (Kap. 29). */
    compareRevenue: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, reference: z.string().datetime().optional() }))
      .query(async ({ input, ctx }) =>
        ctx.reporting.compareRevenue(input.granularity, input.reference ? new Date(input.reference) : new Date())
      ),

    /** Periodenvergleich Aufträge: aktuell vs. Vorperiode (Kap. 29). */
    compareOrders: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, reference: z.string().datetime().optional() }))
      .query(async ({ input, ctx }) =>
        ctx.reporting.compareOrders(input.granularity, input.reference ? new Date(input.reference) : new Date())
      ),

    /** KI-gestützte Zusammenfassung der Kennzahlen (Claude); ohne Schlüssel Heuristik. */
    aiSummary: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, reference: z.string().datetime().optional(), ...rangeShape }))
      .mutation(async ({ input, ctx }) =>
        ctx.reporting.aiSummary(
          input.granularity,
          input.reference ? new Date(input.reference) : new Date(),
          toRange(input)
        )
      ),

    /** Umsatz-Auswertung als PDF (base64) — Übersicht + Shop-/Kundengruppen-Aufriss. */
    exportPdf: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, reference: z.string().datetime().optional(), ...rangeShape }))
      .mutation(async ({ input, ctx }) =>
        ctx.reporting.exportPdf(
          input.granularity,
          input.reference ? new Date(input.reference) : new Date(),
          toRange(input)
        )
      ),
  }),

  productionReporting: router({
    /** Durchlaufzeit je Periode + Kennzahlen (operativ, auch für PRODUKTION). */
    leadTime: protectedProcedure
      .input(z.object({ granularity: granularityEnum, ...rangeShape }))
      .query(async ({ input, ctx }) => ctx.productionReporting.leadTimeOverview(input.granularity, toRange(input))),

    /** Fehlerquote je Periode, gesamt und je Ursache (Kap. 20/29, operativ). */
    defects: protectedProcedure
      .input(z.object({ granularity: granularityEnum, ...rangeShape }))
      .query(async ({ input, ctx }) => ctx.productionReporting.defectOverview(input.granularity, toRange(input))),

    /** Termintreue (On-Time-Quote) je Periode + gesamt (Kap. 35.4, operativ). */
    onTime: protectedProcedure
      .input(z.object({ granularity: granularityEnum, ...rangeShape }))
      .query(async ({ input, ctx }) => ctx.productionReporting.onTimeOverview(input.granularity, toRange(input))),
  }),

  productionSheet: router({
    /** Erzeugt den Produktionszettel-PDF (T-11); fehlende Pflichtfelder → BAD_REQUEST. */
    render: protectedProcedure
      .input(
        z.object({
          productionId: z.string().min(1),
          kind: z.enum(["INTERN", "EXTERN"]),
          extra: z
            .object({
              maschine: z.string().optional(),
              temperaturC: z.number().optional(),
              presszeitSek: z.number().optional(),
              dienstleister: z.string().optional(),
              positionierung: z.string().optional(),
              anlieferDatum: z.string().datetime().optional(),
              fertigstellDatum: z.string().datetime().optional(),
            })
            .default({}),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { anlieferDatum, fertigstellDatum, ...rest } = input.extra;
        try {
          return await ctx.productionSheet.render({
            productionId: input.productionId,
            kind: input.kind,
            extra: {
              ...rest,
              ...(anlieferDatum ? { anlieferDatum: new Date(anlieferDatum) } : {}),
              ...(fertigstellDatum ? { fertigstellDatum: new Date(fertigstellDatum) } : {}),
            },
          });
        } catch (err) {
          if (err instanceof ProductionSheetIncompleteError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          throw err;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
