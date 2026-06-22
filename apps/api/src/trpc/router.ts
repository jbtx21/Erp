// tRPC-AppRouter: Auth (Login/2FA/RBAC) + Shop-Order-Ingest/Liste.
import { TRPCError } from "@trpc/server";
import { ProductionSheetIncompleteError, redactOrderForRole, SubProductionTransitionError, scheduleBackward, backwardStart, type LeadStage } from "@texma/shared";
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

    /** Positionen eines Auftrags (z. B. zur Reklamations-Zeilenauswahl). */
    lines: roleProcedure(...supplierRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.orders.orderLines(input.orderId)),

    /** Auftrags-Status weiterschalten (F2-geprüft, Kap. 35.2). */
    transition: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        orderId: z.string().min(1),
        to: z.enum(["IN_BEARBEITUNG", "IN_PRODUKTION", "VERSANDBEREIT", "VERSENDET", "FAKTURIERT", "ABGESCHLOSSEN", "STORNIERT"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const res = await ctx.orderWorkflow.transition(input.orderId, input.to);
          // G-5: In-App-Benachrichtigung über den Statuswechsel (Versand-Integrationspunkt separat).
          await ctx.notifications.notify(ctx.user.email, `Auftrag → ${input.to}`, `Auftrag ${input.orderId} ist jetzt ${input.to}.`, "orders");
          return res;
        } catch (e) { throw new TRPCError({ code: "CONFLICT", message: (e as Error).message }); }
      }),

    /** Zugesagten Liefertermin setzen/entfernen (B9, Kap. 35.2). Auditiert. */
    setLiefertermin: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1), deliveryDate: z.string().datetime().nullable() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.orderWorkflow.setDeliveryDate(
            input.orderId,
            input.deliveryDate ? new Date(input.deliveryDate) : null
          );
        } catch (e) { throw new TRPCError({ code: "CONFLICT", message: (e as Error).message }); }
      }),

    /** Teil-Status neu berechnen (G-4): Liefer-/Fakturastatus aus Lieferung/Rechnung. */
    recomputeFulfillment: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.orderWorkflow.recomputeFulfillment(input.orderId); }
        catch (e) { throw new TRPCError({ code: "CONFLICT", message: (e as Error).message }); }
      }),
  }),

  // Rückwärtsterminierung (B9, Kap. 35.2). preview ist rein (keine Persistenz): aus
  // Liefertermin + sequenziellen Durchlaufzeiten der spätestmögliche Starttermin je Stufe.
  scheduling: router({
    preview: protectedProcedure
      .input(z.object({
        deliveryDate: z.string().datetime(),
        stages: z.array(z.object({ label: z.string().min(1), durationDays: z.number().nonnegative() })).min(1),
      }))
      .query(({ input }) => {
        const delivery = new Date(input.deliveryDate);
        const stages: LeadStage[] = input.stages;
        const scheduled = scheduleBackward(delivery, stages);
        return {
          start: backwardStart(delivery, stages).toISOString(),
          deliveryDate: delivery.toISOString(),
          stages: scheduled.map((s) => ({
            label: s.label,
            durationDays: s.durationDays,
            start: s.start.toISOString(),
            end: s.end.toISOString(),
          })),
        };
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

    /** Alle Lieferanten-Stammsätze. */
    listAll: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.suppliers.listSuppliers()),

    /** Legt einen Lieferanten an (manueller Stammsatz). */
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ name: z.string().min(1), vatId: z.string().optional(), iban: z.string().optional(), bic: z.string().optional() }))
      .mutation(({ input, ctx }) => ctx.suppliers.createSupplier(input)),
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

    /** Bank-Verbindungen (EBICS/PSD2): Auszüge abrufen (AIS, Kap. 9). */
    connections: router({
      list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.bankConnections.listConnections()),

      create: roleProcedure(...supplierRoles)
        .input(
          z.object({
            name: z.string().min(1),
            kind: z.enum(["EBICS", "PSD2"]),
            iban: z.string().min(1),
            bic: z.string().optional(),
            debtorName: z.string().min(1),
            consentValidUntil: z.string().datetime().optional(),
          })
        )
        .mutation(({ input, ctx }) =>
          ctx.bankConnections.createConnection({
            ...input,
            consentValidUntil: input.consentValidUntil ? new Date(input.consentValidUntil) : null,
          })
        ),

      sync: roleProcedure(...supplierRoles)
        .input(z.object({ connectionId: z.string().min(1) }))
        .mutation(({ input, ctx }) => ctx.bankConnections.sync(input.connectionId)),

      delete: roleProcedure(...supplierRoles)
        .input(z.object({ connectionId: z.string().min(1) }))
        .mutation(({ input, ctx }) => ctx.bankConnections.deleteConnection(input.connectionId)),
    }),

    /** SEPA-Überweisungen auslösen (PIS, pain.001) über EBICS/PSD2 (Kap. 9). */
    payments: router({
      list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.bankConnections.listPaymentOrders()),

      payableInvoices: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.bankConnections.listPayableInvoices()),

      create: roleProcedure(...supplierRoles)
        .input(
          z.object({
            connectionId: z.string().min(1),
            requestedExecutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            transfers: z
              .array(
                z.object({
                  creditorName: z.string().min(1),
                  creditorIban: z.string().min(1),
                  creditorBic: z.string().optional(),
                  amountCents: z.number().int().positive(),
                  remittance: z.string().max(140),
                })
              )
              .min(1),
          })
        )
        .mutation(({ input, ctx }) => ctx.bankConnections.createPaymentOrder(input)),

      submit: roleProcedure(...supplierRoles)
        .input(z.object({ orderId: z.string().min(1) }))
        .mutation(({ input, ctx }) => ctx.bankConnections.submitPaymentOrder(input.orderId)),
    }),
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
          /** Beistell- bzw. Rücklaufmenge (Mengenfluss/Schwund, T-04). */
          menge: z.number().int().nonnegative().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.subproduction.advanceStage(
            input.subProductionId,
            input.to,
            input.at ? new Date(input.at) : new Date(),
            input.menge != null ? { menge: input.menge } : {}
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

    /** Fremdvergabe-Plan je PA: nächste/blockierte/überfällige Stufe, Schwund, Yield (T-04). */
    plan: protectedProcedure
      .input(z.object({ productionId: z.string().min(1), now: z.string().datetime().optional() }))
      .query(async ({ input, ctx }) =>
        ctx.subproduction.productionSubPlan(input.productionId, input.now ? new Date(input.now) : new Date())
      ),
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
    /** Ebenenübergreifende Terminübersicht (Kap. 35.4): kritisch/ROT zuerst (operativ). */
    overview: protectedProcedure
      .input(z.object({ today: z.string().datetime().optional() }).optional())
      .query(async ({ input, ctx }) =>
        ctx.ampel.overview(input?.today ? new Date(input.today) : new Date())
      ),

    /** Ampel-Dashboard: Zählungen je Status/Ebene, Überfällige, Eskalation (Kap. 35.4). */
    summary: protectedProcedure
      .input(z.object({ today: z.string().datetime().optional() }).optional())
      .query(async ({ input, ctx }) =>
        ctx.ampel.summary(input?.today ? new Date(input.today) : new Date())
      ),
  }),

  stickerei: router({
    /** Firmen für die Logo-Zuordnung beim Anlegen. */
    companies: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.stickerei.listCompanies()),

    /** Logo-Verwaltung (Kap. 7.2): Liste + Versionen anlegen + aktiv setzen. */
    logos: router({
      list: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.stickerei.listLogos()),

      create: roleProcedure("ADMIN", "BUERO")
        .input(
          z.object({
            companyId: z.string().min(1),
            // Beliebiges Dateiformat (Kap. 7.1); Bytes base64-kodiert.
            file: z.object({ name: z.string().min(1), mimeType: z.string(), dataBase64: z.string().min(1) }),
            active: z.boolean(),
          })
        )
        .mutation(({ input, ctx }) => ctx.stickerei.createLogoVersion(input)),

      activate: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ logoVersionId: z.string().min(1) }))
        .mutation(({ input, ctx }) => ctx.stickerei.activateLogoVersion(input.logoVersionId)),

      replaceFile: roleProcedure("ADMIN", "BUERO")
        .input(
          z.object({
            logoVersionId: z.string().min(1),
            file: z.object({ name: z.string().min(1), mimeType: z.string(), dataBase64: z.string().min(1) }),
          })
        )
        .mutation(({ input, ctx }) => ctx.stickerei.replaceLogoFile(input.logoVersionId, input.file)),

      delete: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ logoVersionId: z.string().min(1) }))
        .mutation(({ input, ctx }) => ctx.stickerei.deleteLogoVersion(input.logoVersionId)),
    }),

    /** Stickerei-Plan einer Firma (Kap. 5.4): Weg + Digitalisierungsbedarf + Begründung. */
    routeForCompany: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ companyId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.stickerei.routeForCompany(input.companyId)),

    /** Mengenstaffeln je Logo (Stick-EK je Stück → unser VK = EK × 1,88, Kap. 4.4 / T-15). */
    staffeln: router({
      /** Staffeln eines Logos inkl. berechneter VKs/DB (preis-sensibel, kein PRODUKTION). */
      list: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ logoVersionId: z.string().min(1) }))
        .query(({ input, ctx }) => ctx.stickerei.listStaffeln(input.logoVersionId)),

      /** Speichert die Staffeln (Stick-EK je Stück) + optional den Logo-Override-Faktor. */
      save: roleProcedure("ADMIN", "BUERO")
        .input(
          z.object({
            logoVersionId: z.string().min(1),
            staffeln: z.array(
              z.object({
                minMenge: z.number().int().min(1),
                ekCents: z.number().int().nonnegative(),
              })
            ),
            // null = Override löschen, Zahl = setzen, weglassen = unverändert.
            logoOverride: z.number().positive().nullable().optional(),
          })
        )
        .mutation(({ input, ctx }) =>
          ctx.stickerei.saveStaffeln(input.logoVersionId, input.staffeln, input.logoOverride)
        ),

      /** Gültige Staffel (EK + unser VK je Stück) für eine konkrete Bestellmenge. */
      priceForMenge: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ logoVersionId: z.string().min(1), menge: z.number().int().nonnegative() }))
        .query(({ input, ctx }) => ctx.stickerei.priceForMenge(input.logoVersionId, input.menge)),
    }),

    /** Konfigurierbarer Aufschlagsfaktor (Kap. 4.4): Standard + Regeln je Parameter. */
    markup: router({
      getConfig: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.stickerei.getMarkupConfig()),

      saveConfig: roleProcedure("ADMIN", "BUERO")
        .input(
          z.object({
            defaultFactor: z.number().positive(),
            rules: z.array(
              z.object({
                id: z.string().optional(),
                factor: z.number().positive(),
                label: z.string().optional(),
                priceGroupId: z.string().optional(),
                finishingType: z.enum(["STICKEREI", "DRUCK", "TRANSFER"]).optional(),
                minMenge: z.number().int().min(1).optional(),
                maxMenge: z.number().int().min(1).optional(),
                minEkCents: z.number().int().nonnegative().optional(),
                maxEkCents: z.number().int().nonnegative().optional(),
              })
            ),
          })
        )
        .mutation(({ input, ctx }) => ctx.stickerei.saveMarkupConfig(input)),
    }),
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

    /** Kombinierter Gesamtbericht als PDF: Umsatz + Aufrisse + operative KPIs (Kap. 29/35). */
    exportFullPdf: roleProcedure(...supplierRoles)
      .input(z.object({ granularity: granularityEnum, reference: z.string().datetime().optional(), ...rangeShape }))
      .mutation(async ({ input, ctx }) => {
        const range = toRange(input);
        const [leadTime, defects, onTime] = await Promise.all([
          ctx.productionReporting.leadTimeOverview(input.granularity, range),
          ctx.productionReporting.defectOverview(input.granularity, range),
          ctx.productionReporting.onTimeOverview(input.granularity, range),
        ]);
        return ctx.reporting.exportFullPdf(
          input.granularity,
          input.reference ? new Date(input.reference) : new Date(),
          { leadTime, defects, onTime },
          range
        );
      }),
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

  // Artikel/Varianten-Stammdaten (B16): anlegen/auflisten (Farbe×Größe).
  products: router({
    listArticles: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.products.listArticles()),
    listVariants: roleProcedure(...supplierRoles)
      .input(z.object({ articleId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.products.listVariants(input.articleId)),
    createArticle: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ sku: z.string().min(1), name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.createArticle(input.sku, input.name); } catch (e) { throw toTrpcError(e); }
      }),
    createVariant: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        articleId: z.string().min(1),
        sku: z.string().min(1),
        attributes: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.createVariant(input); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Angebote (B8): auflisten + Entwurf anlegen + Status weiterschalten + ablehnen.
  quotes: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.quotes.list()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        companyId: z.string().min(1),
        gueltigBisAm: z.string().datetime().optional(),
        lines: z.array(z.object({ description: z.string().min(1), qty: z.number().int().positive(), unitNetCents: z.number().int().nonnegative() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.quotes.create({ ...input, gueltigBisAm: input.gueltigBisAm ? new Date(input.gueltigBisAm) : null }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    transition: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), to: z.enum(["VERSENDET", "NACHFASSEN", "ANGENOMMEN"]) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.quotes.transition(input.id, input.to); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "CONFLICT", message: (e as Error).message }); }
      }),
    reject: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), verlustgrund: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.quotes.reject(input.id, input.verlustgrund); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "CONFLICT", message: (e as Error).message }); }
      }),
  }),

  // Preisfindung mit Mengenstaffel (B4, Kap. 4.4 / T-15). Finanziell sensibel → kein
  // PRODUKTION-Zugriff. resolve liefert Preis + Herkunft der greifenden Stufe.
  pricing: router({
    resolve: roleProcedure(...supplierRoles)
      .input(z.object({ companyId: z.string().min(1), variantId: z.string().min(1), menge: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.pricing.resolve(input.companyId, input.variantId, input.menge); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    tiers: roleProcedure(...supplierRoles)
      .input(z.object({ companyId: z.string().min(1), variantId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.pricing.listTiers(input.companyId, input.variantId)),
    addGroupTier: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        companyId: z.string().min(1), variantId: z.string().min(1),
        minMenge: z.number().int().positive(), netCents: z.number().int().nonnegative(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.pricing.addGroupTier(input.companyId, input.variantId, input.minMenge, input.netCents); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Mehrfach-Teillieferung: Restmengen + (Teil-)Lieferscheine je Auftragsposition.
  deliveries: router({
    remaining: roleProcedure("ADMIN", "BUERO", "PRODUKTION")
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.deliveries.remaining(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    list: roleProcedure("ADMIN", "BUERO", "PRODUKTION")
      .input(z.object({ orderId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.deliveries.listDeliveryNotes(input.orderId)),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        orderId: z.string().min(1),
        lines: z.array(z.object({ orderLineId: z.string().min(1), qty: z.number().int().nonnegative() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.deliveries.createDeliveryNote(input.orderId, input.lines); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Generisches Dashboard (ERP-Grundfunktion / G-7): Charts/KPI-Kacheln als
  // wiederverwendbare Entitäten über einem festen Metrik-Katalog.
  dashboards: router({
    metrics: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.dashboards.listMetrics()),
    listCharts: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.dashboards.listCharts()),
    listCards: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.dashboards.listCards()),
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.dashboards.listDashboards()),
    resolved: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.dashboards.getResolved(input.id); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    createChart: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ name: z.string().min(1), chartType: z.enum(["BAR", "LINE", "DONUT"]).default("BAR"), metricKey: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.createChart(input.name, input.chartType, input.metricKey); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    createCard: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ name: z.string().min(1), metricKey: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.createCard(input.name, input.metricKey); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    createDashboard: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.createDashboard(input.name); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    addItem: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ dashboardId: z.string().min(1), kind: z.enum(["CHART", "CARD"]), refId: z.string().min(1), width: z.enum(["FULL", "HALF"]).default("HALF") }))
      .mutation(({ input, ctx }) => ctx.dashboards.addItem(input.dashboardId, input.kind, input.refId, input.width)),
  }),

  // Benachrichtigungen (ERP-Grundfunktion / G-5): In-App-Feed je angemeldete:r Nutzer:in.
  notifications: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
      .query(({ input, ctx }) => ctx.notifications.listFor(ctx.user.email, input?.limit ?? 30)),
    unreadCount: protectedProcedure.query(({ ctx }) => ctx.notifications.unreadCount(ctx.user.email)),
    markRead: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { await ctx.notifications.markRead(input.id); return { ok: true as const }; }),
    markAllRead: protectedProcedure
      .mutation(async ({ ctx }) => { await ctx.notifications.markAllRead(ctx.user.email); return { ok: true as const }; }),
  }),

  // E-Mail-/Text-Vorlagen (ERP-Grundfunktion / G-5): {{platzhalter}}-Rendering.
  emailTemplates: router({
    list: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.emailTemplates.list()),
    upsert: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ key: z.string().min(1), subject: z.string().min(1), body: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.emailTemplates.upsert(input.key, input.subject, input.body); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    render: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ key: z.string().min(1), vars: z.record(z.string(), z.union([z.string(), z.number()])).default({}) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.emailTemplates.render(input.key, input.vars); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
  }),

  // Globale Suche (ERP-Grundfunktion / G-6): entitätsübergreifend, ab 2 Zeichen.
  search: router({
    global: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().int().positive().max(50).optional() }))
      .query(({ input, ctx }) => ctx.search.global(input.query, input.limit ?? 20)),
  }),

  // Generischer Datensatz-Querschnitt (ERP-Grundfunktion): Kommentare, Aktivitäten
  // ("was ist als Nächstes") und Anhänge an JEDEM Beleg/Stammsatz (entity, entityId).
  collab: router({
    list: protectedProcedure
      .input(z.object({ entity: z.string().min(1), entityId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ({
        comments: await ctx.collaboration.listComments(input.entity, input.entityId),
        activities: await ctx.collaboration.listActivities(input.entity, input.entityId),
        attachments: await ctx.collaboration.listAttachments(input.entity, input.entityId),
      })),
    addComment: protectedProcedure
      .input(z.object({ entity: z.string().min(1), entityId: z.string().min(1), text: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.collaboration.addComment(input.entity, input.entityId, ctx.user.email, input.text)),
    addActivity: protectedProcedure
      .input(z.object({
        entity: z.string().min(1), entityId: z.string().min(1),
        kind: z.enum(["TASK", "EVENT"]).default("TASK"),
        title: z.string().min(1), dueDate: z.string().datetime().nullable().default(null),
      }))
      .mutation(({ input, ctx }) => ctx.collaboration.addActivity(input.entity, input.entityId, ctx.user.email, {
        kind: input.kind, title: input.title, dueDate: input.dueDate ? new Date(input.dueDate) : null,
      })),
    setActivityDone: protectedProcedure
      .input(z.object({ id: z.string().min(1), done: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.collaboration.setActivityDone(input.id, input.done); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    addAttachment: protectedProcedure
      .input(z.object({
        entity: z.string().min(1), entityId: z.string().min(1),
        fileName: z.string().min(1), mimeType: z.string().nullable().default(null), url: z.string().min(1),
      }))
      .mutation(({ input, ctx }) => ctx.collaboration.addAttachment(input.entity, input.entityId, ctx.user.email, {
        fileName: input.fileName, mimeType: input.mimeType, url: input.url,
      })),
  }),

  // Firmen/Kunden-Stammdaten (B3): anlegen/auflisten/bearbeiten.
  companies: router({
    list: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG").query(({ ctx }) => ctx.companies.list()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        name: z.string().min(1),
        branche: z.string().optional(),
        zahlungszielTage: z.number().int().min(0).max(180).optional(),
        priceGroupKind: z.enum(["STANDARD", "TOP", "PREMIUM", "WIEDERVERKAEUFER", "AGENTUR"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.companies.create(input); } catch (e) { throw toTrpcError(e); }
      }),
    update: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        branche: z.string().optional(),
        zahlungszielTage: z.number().int().min(0).max(180).optional(),
        mahnsperre: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.companies.update(input); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Muster-Leihgut (B5): Ausgabe/Rückgabe + 21-Tage-Berechnung (Listenpreis).
  sampleLoans: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.sampleLoans.list()),
    issue: roleProcedure(...supplierRoles)
      .input(z.object({ companyId: z.string().min(1), variantId: z.string().min(1), menge: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.sampleLoans.issue(input); } catch (e) { throw toTrpcError(e); }
      }),
    returnSample: roleProcedure(...supplierRoles)
      .input(z.object({ loanId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.sampleLoans.returnSample(input.loanId); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
    billOverdue: roleProcedure(...supplierRoles)
      .mutation(async ({ ctx }) => {
        try { return await ctx.sampleLoans.billOverdue(); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Anfragen (B20): Funnel NEU->IN_BEARBEITUNG->ANGEBOT; Konvertierung erzeugt Quote.
  inquiries: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.inquiries.list()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({
        quelle: z.enum(["WEB", "EMAIL", "SHOP", "TELEFON"]),
        text: z.string().min(1),
        companyId: z.string().optional(),
        kontaktName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.inquiries.create(input); } catch (e) { throw toTrpcError(e); }
      }),
    startProcessing: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.inquiries.startProcessing(input.id); } catch (e) { throw toTrpcError(e); }
      }),
    convertToQuote: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.inquiries.convertToQuote(input.id); } catch (e) { throw toTrpcError(e); }
      }),
    discard: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1), grund: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.inquiries.discard(input.id, input.grund); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Leads/Interessenten (B15): Funnel NEU->KONTAKTIERT->QUALIFIZIERT->konvertiert.
  leads: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.leads.list()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({
        name: z.string().min(1),
        quelle: z.enum(["WEB", "EMAIL", "SHOP", "TELEFON"]),
        email: z.string().optional(),
        phone: z.string().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.leads.create(input); } catch (e) { throw toTrpcError(e); }
      }),
    transition: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1), to: z.enum(["KONTAKTIERT", "QUALIFIZIERT"]) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.leads.transition(input.id, input.to); } catch (e) { throw toTrpcError(e); }
      }),
    convert: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.leads.convert(input.id); } catch (e) { throw toTrpcError(e); }
      }),
    discard: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1), grund: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.leads.discard(input.id, input.grund); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Kostenstellen (B7): Stammdaten anlegen/auflisten/löschen + Auswertung je Kostenstelle.
  costCenters: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.costCenters.list()),
    report: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.costCenters.invoiceReport()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({ nummer: z.string().min(1), name: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.costCenters.create(input.nummer, input.name)),
    delete: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.costCenters.remove(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
