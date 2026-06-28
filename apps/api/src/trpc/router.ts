// tRPC-AppRouter: Auth (Login/2FA/RBAC) + Shop-Order-Ingest/Liste.
import { TRPCError } from "@trpc/server";
import { ProductionSheetIncompleteError, redactOrderForRole, canViewFinancials, SubProductionTransitionError, scheduleBackward, backwardStart, orderStatusLabel, belegTemplateKey, belegTemplateByKind, mahnungTemplateKey, renderTemplate, type LeadStage } from "@texma/shared";
import { ReklamationValidationError } from "../modules/reklamation/reklamation.service.js";
import { z } from "zod";
import { AuthError, SESSION_TTL_SECONDS } from "../modules/auth/auth.service.js";
import { protectedProcedure, publicProcedure, roleProcedure, router, type Context } from "./trpc.js";
import type { Belegart } from "@texma/shared";
import type { BelegMailKind } from "../modules/print/print.service.js";

// EK-Preise sind finanziell sensibel → kein PRODUKTION-Zugriff (Kap. 12, C3).
const supplierRoles = ["ADMIN", "BUERO", "BUCHHALTUNG"] as const;
// Alle Rollen inkl. PRODUKTION — z. B. fürs personalisierte Dashboard (Finanzkennzahlen
// werden für PRODUKTION serverseitig redigiert, Kap. 12).
const allRoles = ["ADMIN", "BUERO", "BUCHHALTUNG", "PRODUKTION"] as const;

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
  // Optionale Anreicherung (Säule C): erlaubt das Anlegen unbekannter SKUs als Artikel + Variante.
  articleName: z.string().optional(),
  parentSku: z.string().optional(),
  farbe: z.string().optional(),
  groesse: z.string().optional(),
});

function toTrpcError(err: unknown): never {
  if (err instanceof AuthError) {
    const code = err.code === "LOCKED" ? "TOO_MANY_REQUESTS" : "UNAUTHORIZED";
    throw new TRPCError({ code, message: err.message });
  }
  throw err;
}

/** Belegnummer aus dem PDF-Dateinamen (z. B. „Angebot-AN-0001.pdf" → „AN-0001"). */
function belegNummerAusDateiname(filename: string): string {
  return filename.replace(/\.pdf$/, "").replace(/^[^-]+-/, "");
}

/**
 * Betreff/Text eines Kunden-Belegs für SMTP-Versand UND Outlook-Entwurf.
 * Liest die auf der Vorlagen-Seite (#emailtemplates) GEPFLEGTE Vorlage (Schlüssel „beleg.<typ>")
 * und füllt {{ belegnr }}; ohne gepflegte Vorlage greift die Default-Vorlage aus @texma/shared.
 * So wirkt sich die Vorlagenpflege tatsächlich auf den Versand aus (G-5).
 */
async function belegMailText(ctx: Context, kind: BelegMailKind, id: string, filename: string): Promise<{ subject: string; body: string }> {
  const belegnr = belegNummerAusDateiname(filename);
  // Vorlagenschlüssel in Prioritätsreihenfolge probieren. Mahnung: stufenspezifische
  // Vorlage „beleg.mahnung.<stufe>" (Zahlungserinnerung/1./2. Mahnung), sonst generisch.
  const keys: string[] = [];
  if (kind === "MAHNUNG") {
    const stufe = await ctx.print.dunningStufeForNotice(id).catch(() => null);
    if (stufe != null) keys.push(mahnungTemplateKey(stufe));
  }
  keys.push(belegTemplateKey(kind));
  for (const key of keys) {
    try { return await ctx.emailTemplates.render(key, { belegnr }); } catch { /* nächste Vorlage versuchen */ }
  }
  // Defensive: sollte nicht eintreten (Defaults sind registriert) — direkt aus dem Default rendern.
  const def = belegTemplateByKind(kind);
  return { subject: renderTemplate(def.subject, { belegnr }), body: renderTemplate(def.body, { belegnr }) };
}

/** Das passende Beleg-PDF je Kind erzeugen (gemeinsam für SMTP-Versand + Outlook-Entwurf). */
function belegPdf(ctx: Context, kind: BelegMailKind, id: string): Promise<{ filename: string; base64: string }> {
  switch (kind) {
    case "QUOTE": return ctx.print.quotePdf(id);
    case "INVOICE": return ctx.print.invoicePdf(id);
    case "AUFTRAGSBESTAETIGUNG": return ctx.print.auftragsbestaetigungPdf(id);
    case "LIEFERSCHEIN": return ctx.print.deliveryNotePdf(id);
    case "GUTSCHRIFT": return ctx.print.creditNotePdf(id);
    case "MAHNUNG": return ctx.print.mahnungPdf(id);
    case "LEIHGUT": return ctx.print.sampleLoanLieferscheinPdf(id);
  }
}

/**
 * Auto-Archivierung (GoBD, Kap. 10): schreibt einen finalisierten/versendeten Beleg server-
 * seitig, idempotent (SHA-256) und nicht-umgehbar ins WORM-Archiv. Best-effort: ein Archiv-
 * Fehler darf die bereits erfolgte Finalisierung (Rechnung/Versand …) NICHT zurückrollen —
 * nicht archivierte Finals deckt der Vollständigkeits-Report (archive.missing) auf, und der
 * Backfill (archive.backfill) zieht sie nach. Das PDF wird aus dem vorhandenen Generator
 * erzeugt (kein erneuter Upload durch den Nutzer).
 */
async function autoArchive(
  ctx: Context,
  belegart: Belegart,
  sourceEntity: string,
  sourceId: string,
  pdf: () => Promise<{ filename: string; base64: string }>
): Promise<boolean> {
  try {
    const r = await pdf();
    await ctx.archive.archive({
      belegart, sourceEntity, sourceId, fileName: r.filename, contentType: "application/pdf",
      data: new Uint8Array(Buffer.from(r.base64, "base64")), userId: ctx.user?.id,
    });
    return true;
  } catch (e) {
    // Bewusst nur protokollieren — Finalisierung bleibt gültig; Report/Backfill fangen es auf.
    console.warn(`[auto-archive] ${belegart} ${sourceEntity}/${sourceId}: ${(e as Error).message}`);
    return false;
  }
}

/** Hält den Kalender mit einer Aufgabe synchron (Anf. 2): offene Aufgabe mit Fälligkeit →
 *  Ganztags-Termin (Art AUFGABE) beim Zuständigen; erledigt/ohne Fälligkeit → Termin entfernt.
 *  Idempotent über (sourceEntity="task", sourceId). Best-effort — Aufgabe bleibt gültig. */
async function syncTaskCalendar(ctx: Context, taskId: string): Promise<void> {
  try {
    const t = await ctx.tasks.load(taskId);
    if (t && t.status === "OFFEN" && t.dueDate) {
      const d = new Date(t.dueDate);
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      await ctx.calendar.syncSource("task", taskId, { title: `Aufgabe: ${t.title}`, ownerEmail: t.assigneeEmail, start, end: start, allDay: true });
    } else {
      await ctx.calendar.syncSource("task", taskId, null);
    }
  } catch (e) {
    console.warn(`[task-calendar-sync] task/${taskId}: ${(e as Error).message}`);
  }
}

export const appRouter = router({
  auth: router({
    /** Schritt 1: Passwort. Setzt das Session-Cookie (auch bei offener 2FA). */
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        // Brute-Force-Schutz: zu viele Versuche je E-Mail werden vor der Passwortprüfung abgewiesen.
        const rl = ctx.loginRateLimiter?.check(input.email.toLowerCase());
        if (rl && !rl.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Zu viele Anmeldeversuche. Bitte in ${rl.retryAfterSec}s erneut versuchen.` });
        }
        try {
          const res = await ctx.auth.loginWithPassword(input.email, input.password);
          ctx.loginRateLimiter?.reset(input.email.toLowerCase());
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
        // Brute-Force-Schutz: der 6-stellige 2FA-Code ist sonst (nach erlangtem Passwort)
        // ratebar erratbar. Max. Versuche je Sitzungstoken in einem Zeitfenster.
        const rl = ctx.totpRateLimiter?.check(ctx.sessionToken);
        if (rl && !rl.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Zu viele 2FA-Versuche. Bitte in ${rl.retryAfterSec}s erneut versuchen.` });
        }
        try {
          await ctx.auth.verifyTotp(ctx.sessionToken, input.code);
          ctx.totpRateLimiter?.reset(ctx.sessionToken);
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

    // Konto-Selbstverwaltung (jede:r für sich).
    /** Eigenen Namen ändern. */
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.auth.updateProfile(ctx.user.id, input.name); return { ok: true as const }; }
        catch (err) { toTrpcError(err); }
      }),

    /** Eigenes Passwort ändern (altes Passwort erforderlich). */
    changePassword: protectedProcedure
      .input(z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.auth.changePassword(ctx.user.id, input.oldPassword, input.newPassword); return { ok: true as const }; }
        catch (err) { toTrpcError(err); }
      }),

    /** Passwort vergessen: Reset-Link per E-Mail (gibt immer ok zurück — Enumeration-Schutz). */
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        // Rate-Limit gegen E-Mail-Bombing/Token-Spam je Adresse. Bei Überschreitung
        // wird NICHT gesendet, aber dennoch ok gemeldet (Enumeration-Schutz bleibt).
        const rl = ctx.loginRateLimiter?.check(`pwreset:${input.email.toLowerCase()}`);
        if (rl && !rl.allowed) return { ok: true as const };
        try { await ctx.auth.requestPasswordReset(input.email); } catch { /* still ok */ }
        return { ok: true as const };
      }),

    /** Passwort mit gültigem Reset-Token neu setzen. */
    resetPassword: publicProcedure
      .input(z.object({ token: z.string().min(1), newPassword: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.auth.resetPassword(input.token, input.newPassword); return { ok: true as const }; }
        catch (err) { toTrpcError(err); }
      }),

    // Benutzerverwaltung (nur Geschäftsleitung/ADMIN): Konten @texma-gmbh.de + 2FA.
    listUsers: roleProcedure("ADMIN").query(({ ctx }) => ctx.auth.listUsers()),
    createUser: roleProcedure("ADMIN")
      .input(z.object({
        email: z.string().min(3),
        name: z.string().min(1),
        role: z.enum(["ADMIN", "BUERO", "BUCHHALTUNG", "PRODUKTION"]),
        password: z.string().min(8),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.auth.createUser(input); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    setUserActive: roleProcedure("ADMIN")
      .input(z.object({ userId: z.string().min(1), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.auth.setUserActive(input.userId, input.active); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  shopOrders: router({
    /** Importiert eine rohe WooCommerce-Bestellung (T-01: Bindung an die Firma). */
    ingest: roleProcedure("ADMIN", "BUERO")
      .input(
        z.object({
          raw: z.unknown(),
          shopConnectorId: z.string().min(1),
          companyId: z.string().min(1),
          deliveryAddressPolicy: z.enum(["FEST", "FREIE_EINGABE", "AUSWAHL"]).optional(),
          // Manueller Sofort-Abruf: importierten Auftrag direkt auf IN_BEARBEITUNG setzen.
          markInBearbeitung: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const res = await ctx.orderImport.importWooOrder(input.raw, {
          shopConnectorId: input.shopConnectorId,
          companyId: input.companyId,
          deliveryAddressPolicy: input.deliveryAddressPolicy,
        });
        if (input.markInBearbeitung && res.created) {
          try { await ctx.orderWorkflow.transition(res.order.id, "IN_BEARBEITUNG"); } catch { /* Status ggf. schon weiter */ }
        }
        // Sammelbestell-Routing (Kap. 18.2): SAMMEL-Shops bündeln neue Aufträge in die
        // laufende Periode; SOFORT-Shops bleiben unberührt (Service entscheidet anhand
        // des Shop-Modus). Nur für neu angelegte Aufträge, nicht-blockierend.
        if (res.created) {
          try { await ctx.sammelbestellung.attachOrder(res.order.id); } catch { /* nicht kritisch */ }
        }
        return res;
      }),

    /** Shops für die Auswahl (manueller Abruf / Zuordnung). */
    shops: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.sammelbestellung.listShops()),

    /** Manueller Sofort-Abruf EINER Bestellung über Shop + Bestellnummer (dringende Aufträge).
     *  Reiht den Abruf in die Outbox ein; der Worker holt + importiert + markiert IN_BEARBEITUNG. */
    requestManualFetch: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ shopConnectorId: z.string().min(1), externalNumber: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.orderImport.requestManualFetch(input.shopConnectorId, input.externalNumber); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

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

    /** Eilauftrag-Priorisierung (Xentral „Fast-Lane") setzen/entfernen. */
    setFastLane: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1), on: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.orderWorkflow.setFastLane(input.orderId, input.on); }
        catch (e) { throw toTrpcError(e); }
      }),

    /** Belegkette/Connections (ERPNext-Muster): Vorgänger + Nachfolger, nach Phase gruppiert. */
    connections: protectedProcedure
      .input(z.object({ orderId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.connections.orderConnections(input.orderId)),

    /** Auftrags-Status weiterschalten (F2-geprüft, Kap. 35.2). */
    transition: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        orderId: z.string().min(1),
        to: z.enum(["IN_BEARBEITUNG", "IN_PRODUKTION", "VERSANDBEREIT", "VERSENDET", "FAKTURIERT", "ABGESCHLOSSEN", "STORNIERT"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Produktionsstart-Gate (T-05): → IN_PRODUKTION nur, wenn der Wareneingang der
          // zugehörigen Beschaffung vollständig ist (greift nur bei Produktion mit Bestellungen).
          if (input.to === "IN_PRODUKTION") {
            const gate = await ctx.procurement.startGateForOrder(input.orderId);
            if (gate.blocked) throw new TRPCError({ code: "CONFLICT", message: gate.reason ?? "Produktionsstart gesperrt." });
          }
          // Freigabe-Gate (K-10, Kap. 12.1): die verbindliche Auftragsaktivierung (→ IN_BEARBEITUNG)
          // greift gegen die gepflegten Schwellen — auch für Handelsaufträge ohne Produktion. Über
          // der Rabatt-/Wertgrenze nur durch die Geschäftsleitung (ADMIN).
          let releaseOpts: { role?: string; thresholds?: { maxDiscountPct: number | null; maxOrderValueCents: number | null } } = {};
          if (input.to === "IN_BEARBEITUNG") {
            const s = await ctx.settings.get();
            releaseOpts = {
              role: ctx.user.role,
              thresholds: { maxDiscountPct: s.maxDiscountPct, maxOrderValueCents: s.maxOrderValueEuro === null ? null : Math.round(s.maxOrderValueEuro * 100) },
            };
          }
          const res = await ctx.orderWorkflow.transition(input.orderId, input.to, releaseOpts);
          // Versand-Verkettung: → VERSENDET erzeugt automatisch einen Lieferschein über alle
          // offenen Restmengen (bucht Bestandsabgang + setzt lieferstatus). Kein „versendet
          // ohne Lieferung" mehr. Best-effort: ein bereits voll gelieferter Auftrag → null.
          if (input.to === "VERSENDET") {
            // Best-effort: schlägt die Auto-Lieferung fehl, bleibt der bereits gebuchte
            // Statuswechsel bestehen (lieferstatus dann unverändert, manuell nachholbar).
            try { await ctx.deliveries.deliverRemaining(input.orderId); } catch { /* nicht blockierend */ }
          }
          if (input.to === "STORNIERT") {
            // Storno gibt die noch offenen Bestands-Reservierungen des Auftrags frei
            // (verfügbarer Bestand steigt wieder).
            try { await ctx.reservations.releaseByOrder(input.orderId, "STORNIERT"); } catch { /* nicht blockierend */ }
          }
          // G-5: In-App-Benachrichtigung über den Statuswechsel — mit sprechender Belegnummer
          // (AB-…) statt cuid und lesbarem Status statt Enum (P2.8).
          const orderLabel = res.number ?? input.orderId;
          await ctx.notifications.notify(ctx.user.email, `Auftrag ${orderLabel} → ${orderStatusLabel(input.to)}`, `Auftrag ${orderLabel} ist jetzt ${orderStatusLabel(input.to)}.`, "orders");
          // Regel-Engine: konfigurierte Automationen zum Statuswechsel auslösen (Event → Aktion).
          await ctx.automation.handleEvent("order.status.changed", { orderId: input.orderId, status: input.to, userEmail: ctx.user.email });
          // Auftragsampel-Trigger: aktuelle Prozessstufe + Gesamtampel nachrechnen und als
          // Events feuern (z. B. „Stufe versandfertig erreicht" → Benachrichtigung; „Ampel ROT"
          // → Eskalation). Best-effort, blockiert den Statuswechsel nicht.
          try {
            const tf = await ctx.statusAmpel.triggerFacts(input.orderId);
            if (tf) {
              await ctx.automation.handleEvent("order.stage.changed", { orderId: input.orderId, stage: tf.stage, status: input.to, ampel: tf.overall, userEmail: ctx.user.email });
              if (tf.overall === "ROT") {
                await ctx.automation.handleEvent("auftragsampel.red", { orderId: input.orderId, status: input.to, blocker: tf.blocker ?? "", userEmail: ctx.user.email });
              }
            }
          } catch { /* Trigger-Auswertung ist nicht kritisch für den Statuswechsel */ }
          // Rückmeldung (Kap. 4.2): Shop-Auftrag → Status an den Shop (inkl. Storno); Auftrag
          // ohne Shop → Versand-/Storno-Mail direkt an den Kunden (Workflow-Automatisierung).
          await ctx.orderStatusSync.onStatusChanged(input.orderId, input.to, { enqueueShopPush: true });
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
          createUnknown: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) =>
        ctx.supplierImport.ingestCatalog(input.supplierId, input.items, { createUnknown: input.createUnknown })
      ),

    /** Lieferanten-Artikel mit EK-Preisen (rollen­geschützt, kein PRODUKTION-Zugriff). */
    list: roleProcedure(...supplierRoles)
      .input(z.object({ supplierId: z.string().min(1), limit: z.number().int().positive().max(500).optional() }))
      .query(async ({ input, ctx }) => ctx.suppliers.listItems(input.supplierId, input.limit ?? 100)),

    /** Gesamtes Artikelsortiment eines Lieferanten (alle Katalogartikel, lesbar). */
    catalogAll: roleProcedure(...supplierRoles)
      .input(z.object({ supplierId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.suppliers.catalogAll(input.supplierId)),

    /** Alle Lieferanten-Stammsätze. */
    listAll: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.suppliers.listSuppliers()),

    /** Legt einen Lieferanten an (manueller Stammsatz). */
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ name: z.string().min(1), email: z.string().optional(), vatId: z.string().optional(), iban: z.string().optional(), bic: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.suppliers.createSupplier(input); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    /** Lieferanten-Detail + Historie (Bestellungen, Eingangsrechnungen, Einkaufsvolumen). */
    overview: roleProcedure(...supplierRoles)
      .input(z.object({ supplierId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.suppliers.supplierOverview(input.supplierId)),

    /** Lieferanten-Stammdaten (Adresse/Konditionen) aktualisieren; null = leeren. */
    update: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        id: z.string().min(1),
        name: z.string().optional(), email: z.string().nullable().optional(), vatId: z.string().nullable().optional(), iban: z.string().nullable().optional(), bic: z.string().nullable().optional(),
        street: z.string().nullable().optional(), zip: z.string().nullable().optional(), city: z.string().nullable().optional(), country: z.string().nullable().optional(),
        zahlungszielTage: z.number().int().min(0).max(180).optional(),
        skontoPercent: z.number().int().min(0).max(100).nullable().optional(),
        skontoDays: z.number().int().min(0).max(180).nullable().optional(),
        lieferzeitTage: z.number().int().min(0).max(365).nullable().optional(),
        notiz: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.suppliers.updateSupplier(input); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    /** Ansprechpartner anlegen/löschen. */
    addContact: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ supplierId: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.suppliers.addSupplierContact(input); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    updateContact: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().nullable().optional(), phone: z.string().nullable().optional(), role: z.string().nullable().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { const { id, ...fields } = input; await ctx.suppliers.updateSupplierContact(id, fields); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    deleteContact: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.suppliers.deleteSupplierContact(input.id); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  incomingInvoices: router({
    /** Empfängt eine eingehende E-Rechnung (CII-XML), validiert + erfasst sie (Kap. 19/K-13). */
    receive: roleProcedure(...supplierRoles)
      .input(z.object({ xml: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.incomingInvoiceImport.receive(input.xml); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

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

    /** Bestätigt den Versand: Auftrag → VERSENDET, Tracking + Carrier gespeichert, Shop-Push
     *  eingereiht; bei Aufträgen ohne Shop zusätzlich Versand-Mail an den Kunden (Kap. 4.2). */
    confirmShipped: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        orderId: z.string().min(1),
        trackingNumber: z.string().min(1),
        carrier: z.enum(["DPD", "DHL", "GLS", "UPS", "HERMES", "SONSTIGE"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const res = await ctx.shipments.confirmShipped(input);
        // Shop-Push hat confirmShipped bereits eingereiht → nur Kunden-Mail für Nicht-Shop-Aufträge.
        await ctx.orderStatusSync.onStatusChanged(res.orderId, "VERSENDET", { enqueueShopPush: false });
        // GoBD: alle Lieferscheine des Auftrags unveränderbar archivieren (WORM).
        for (const dn of await ctx.deliveries.listDeliveryNotes(res.orderId)) {
          await autoArchive(ctx, "LIEFERSCHEIN", "DeliveryNote", dn.id, () => ctx.print.deliveryNotePdf(dn.id));
        }
        return res;
      }),
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

    /** Kontoauszüge (CAMT.053): benannte Endpunkte — Import + Eingangs-/Abgleichhistorie (T-13). */
    statements: router({
      import: roleProcedure(...supplierRoles)
        .input(z.object({ xml: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => ctx.bankingImport.importStatement(input.xml)),
      list: roleProcedure(...supplierRoles)
        .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
        .query(async ({ input, ctx }) => ctx.banking.listStatementEntries(input?.limit ?? 50)),
    }),

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
      .mutation(async ({ input, ctx }) => {
        const res = await ctx.dunning.runDunning(input?.today ? new Date(input.today) : new Date());
        // GoBD: jeden erzeugten Mahnbeleg unveränderbar archivieren (WORM).
        for (const noticeId of res.noticeIds) {
          await autoArchive(ctx, "MAHNUNG", "DunningNotice", noticeId, () => ctx.print.mahnungPdf(noticeId));
        }
        return res;
      }),

    /** Mahnübersicht: offene Posten mit Mahnstufe + Sperre (Kap. 9.5). */
    list: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(async ({ input, ctx }) => ctx.dunningQuery.listDunning(input?.limit ?? 50)),
  }),

  procurement: router({
    /** Produktionsaufträge für die Auswahl (ID-Picker statt Freitext). */
    listProductions: protectedProcedure.query(({ ctx }) => ctx.procurement.listProductions()),
    /** Produktionsstart-Gate (T-05): Komponentenstatus + canStart (operativ, keine Preise). */
    productionStartStatus: protectedProcedure
      .input(z.object({ productionId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.procurement.productionStartStatus(input.productionId)),
  }),

  // Wareneingang gegen Bestellung (Kap. 6.3 / T-05): offene Bestellungen + Beleg buchen.
  goodsReceipts: router({
    listOpen: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.goodsReceipts.listOpen()),
    record: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        purchaseOrderId: z.string().min(1),
        lines: z.array(z.object({ variantId: z.string().min(1), receivedQty: z.number().int().nonnegative() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.goodsReceipts.record(input); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Vereinheitlichter Zahlungsabgleich (IA-Objekt-Merge, Kap. 9.4): EIN Lese-/Datenmodell
  // über alle Quellen (CAMT/Provider/manuell) — Zahlungen mit Herkunft + Abgleich-Status
  // und OP-Aging in einem Aufruf. Finanzdaten → kein PRODUKTION-Zugriff.
  reconciliation: router({
    overview: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(500) }).optional())
      .query(({ input, ctx }) => ctx.reconciliation.overview(input?.limit ?? 100)),
  }),

  // Manuelle Zahlungserfassung (Kap. 9.4): offene Posten + Zahlungseingang buchen.
  // Finanzdaten → kein PRODUKTION-Zugriff.
  payments: router({
    listOpen: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.payments.listOpenItems()),
    record: roleProcedure(...supplierRoles)
      .input(z.object({
        openItemId: z.string().min(1),
        amountCents: z.number().int().positive(),
        bookedAt: z.string().datetime().optional(),
        reference: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.payments.record({ ...input, bookedAt: input.bookedAt ? new Date(input.bookedAt) : undefined }); }
        catch (e) { throw toTrpcError(e); }
      }),
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

    /** Schließt einen Inhouse-Veredelungsschritt ab (nach externem Rücklauf am selben Textil). */
    completeInhouse: roleProcedure("ADMIN", "BUERO", "PRODUKTION")
      .input(z.object({ subProductionId: z.string().min(1), at: z.string().datetime().optional() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.subproduction.completeInhouse(input.subProductionId, input.at ? new Date(input.at) : new Date());
        } catch (err) {
          if (err instanceof SubProductionTransitionError) throw new TRPCError({ code: "CONFLICT", message: err.message });
          throw err;
        }
      }),

    /** Fremdvergabe-Übersicht je PA: Stufen + allReturned (operativ). */
    list: protectedProcedure
      .input(z.object({ productionId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ctx.subproduction.productionSubStatus(input.productionId)),

    /** Browsbare Gesamtübersicht: alle offenen Fremdvergabe-Stufen über alle PAs (Xentral-„Overview"). */
    listOpen: protectedProcedure.query(({ ctx }) => ctx.subproduction.listOpen()),

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
    /** Soll-Ist mit automatisch abgeleiteter Plan-Seite (Plan-DB aus dem Auftrag, T-10). */
    computeForProduction: roleProcedure(...supplierRoles)
      .input(z.object({
        productionId: z.string().min(1),
        laborRateCentsPerMinute: z.number().int().nonnegative(),
        planLaborMinutes: z.number().int().nonnegative().optional(),
      }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.postcalc.computeForProduction(input); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
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

    /** Browsbare Gesamtübersicht: alle Reklamationen über alle Aufträge (Xentral-„Overview"). */
    list: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(200).optional() }).optional())
      .query(async ({ input, ctx }) => ctx.reklamation.listRecent(input?.limit ?? 100)),

    /** Folgevorgang auslösen (B11): Gutschrift bzw. Nachproduktions-Auftrag. Nur ADMIN/Büro. */
    executeFollowUp: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ complaintId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.reklamation.executeFollowUp(input.complaintId);
        } catch (err) {
          if (err instanceof ReklamationValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          throw err;
        }
      }),

    /** Reklamation bearbeiten (Ursache/Folgevorgang/Kosten); Kostenträger wird neu abgeleitet. */
    update: roleProcedure(...supplierRoles)
      .input(z.object({
        id: z.string().min(1),
        cause: z.enum(["LIEFERANT", "INTERN", "EXTERN_VEREDLER"]),
        followUp: z.enum(["NACHPRODUKTION", "EXPRESS_NACHPRODUKTION", "GUTSCHRIFT", "KEINE"]),
        costCents: z.number().int().nonnegative(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...rest } = input;
        try { return await ctx.reklamation.update(id, rest); }
        catch (err) {
          if (err instanceof ReklamationValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          throw err;
        }
      }),
  }),

  // Sammelbestellung (Kap. 18.2): gebündelte Mitarbeiter-Shopbestellungen je Periode.
  sammelbestellung: router({
    list: roleProcedure("ADMIN", "BUERO", "PRODUKTION", "BUCHHALTUNG").query(({ ctx }) => ctx.sammelbestellung.list()),
    detail: roleProcedure("ADMIN", "BUERO", "PRODUKTION", "BUCHHALTUNG")
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.sammelbestellung.detail(input.id); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    setStatus: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), status: z.enum(["OFFEN", "GEBUENDELT", "UMGESETZT"]) }))
      .mutation(async ({ input, ctx }) => { await ctx.sammelbestellung.setStatus(input.id, input.status); return { ok: true as const }; }),
    /** Auto-Bündelung am Periodenende (manuell oder per Cron auslösbar). */
    autoBundleDue: roleProcedure("ADMIN", "BUERO").mutation(({ ctx }) => ctx.sammelbestellung.autoBundleDuePeriods()),
    /** Shops + ihr Bestellmodus (SOFORT/SAMMEL) für die Konfiguration. */
    shops: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.sammelbestellung.listShops()),
    setShopMode: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ shopId: z.string().min(1), bestellmodus: z.enum(["SOFORT", "SAMMEL"]), sammelInterval: z.enum(["WOECHENTLICH", "MONATLICH", "QUARTALSWEISE", "HALBJAEHRLICH"]).nullable() }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.sammelbestellung.setShopMode(input.shopId, input.bestellmodus, input.sammelInterval); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Personal Access Tokens (Xentral PAT): read-only API-Zugriff für externe Agenten/MCP.
  // Nur ADMIN; der Klartext ist einmalig bei der Ausstellung sichtbar.
  apiTokens: router({
    list: roleProcedure("ADMIN").query(({ ctx }) => ctx.apiTokens.list()),
    create: roleProcedure("ADMIN")
      .input(z.object({ name: z.string().min(1), role: z.enum(["ADMIN", "BUERO", "PRODUKTION", "BUCHHALTUNG"]) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.apiTokens.create(input.name, input.role); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    revoke: roleProcedure("ADMIN")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { await ctx.apiTokens.revoke(input.id); return { ok: true as const }; }),
  }),

  // Gutscheine (Xentral „Gutscheine"): Wertgutscheine mit Restguthaben + Gültigkeit.
  // Finanzdaten → kein PRODUKTION-Zugriff.
  gutscheine: router({
    list: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG").query(({ ctx }) => ctx.gutscheine.list()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ code: z.string().min(1), initialCents: z.number().int().positive(), validUntil: z.string().datetime().nullable().optional(), note: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.gutscheine.create({ code: input.code, initialCents: input.initialCents, validUntil: input.validUntil ? new Date(input.validUntil) : null, note: input.note ?? null }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    redeem: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ code: z.string().min(1), amountCents: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.gutscheine.redeem(input.code, input.amountCents); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Abschlags-/Teilrechnungen (Xentral): zu einem Auftrag Anzahlungen + Restsumme.
  // Finanzdaten → kein PRODUKTION-Zugriff.
  abschlag: router({
    forOrder: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.abschlag.forOrder(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1), percent: z.number().int().min(1).max(100).optional(), netCents: z.number().int().positive().optional(), note: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.abschlag.create(input.orderId, { percent: input.percent, netCents: input.netCents, note: input.note }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    setBezahlt: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ id: z.string().min(1), bezahlt: z.boolean() }))
      .mutation(async ({ input, ctx }) => { await ctx.abschlag.setBezahlt(input.id, input.bezahlt); return { ok: true as const }; }),
  }),

  ampel: router({
    /** Auftragsampel (Xentral-Vorbild): je aktivem Auftrag Prüf-Lampen (Bestand, USt-IdNr.,
     *  Liefertermin, Lieferung, Faktura, Zahlung, Produktion, Freigabe, Liefersperre) + Gesamt. */
    auftragsampel: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .query(({ ctx }) => ctx.statusAmpel.auftragsampel()),

    /** Auftragsampel + Prozesskette EINES Auftrags (Auftragsdetail-Tab, Auftragsebene). */
    auftragDetail: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const d = await ctx.statusAmpel.auftragDetail(input.orderId);
        if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Auftrag nicht gefunden." });
        return d;
      }),

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

    /** Arbeitsliste als Tabelle (Notbetrieb K-17) — für CSV-Download. */
    worklist: protectedProcedure
      .input(z.object({ today: z.string().datetime().optional() }).optional())
      .query(async ({ input, ctx }) =>
        ctx.ampel.worklist(input?.today ? new Date(input.today) : new Date())
      ),

    /** Arbeitsliste als druckbares PDF (Offline-Notbetrieb K-17). */
    worklistPdf: protectedProcedure
      .input(z.object({ today: z.string().datetime().optional() }).optional())
      .mutation(async ({ input, ctx }) =>
        ctx.ampel.worklistPdf(input?.today ? new Date(input.today) : new Date())
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

    /** Gewählte Stickerei (Lieferant) als Partner der Firma hinterlegen (Mail-Ausschreibung). */
    setPartner: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ companyId: z.string().min(1), supplierId: z.string().min(1).nullable() }))
      .mutation(async ({ input, ctx }) => { await ctx.stickerei.setPartner(input.companyId, input.supplierId); return { ok: true as const }; }),

    /** Ausschreibung (RfQ) je Logo: Angebote erfassen, vergleichen, Gewinner wählen. */
    ausschreibung: router({
      list: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ logoVersionId: z.string().min(1) }))
        .query(({ input, ctx }) => ctx.stickerei.listAusschreibungen(input.logoVersionId)),
      get: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ id: z.string().min(1) }))
        .query(({ input, ctx }) => ctx.stickerei.getAusschreibung(input.id)),
      create: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ logoVersionId: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => { try { return await ctx.stickerei.createAusschreibung(input.logoVersionId); } catch (e) { throw toTrpcError(e); } }),
      addAngebot: roleProcedure("ADMIN", "BUERO")
        .input(z.object({
          ausschreibungId: z.string().min(1),
          supplierId: z.string().min(1),
          notiz: z.string().optional(),
          staffeln: z.array(z.object({ minMenge: z.number().int().min(1), ekCents: z.number().int().min(0) })).min(1),
        }))
        .mutation(async ({ input, ctx }) => { try { return await ctx.stickerei.addAngebot(input.ausschreibungId, input.supplierId, input.staffeln, input.notiz ?? null); } catch (e) { throw toTrpcError(e); } }),
      decide: roleProcedure("ADMIN", "BUERO")
        .input(z.object({ ausschreibungId: z.string().min(1), gewinnerAngebotId: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => { try { return await ctx.stickerei.decideAusschreibung(input.ausschreibungId, input.gewinnerAngebotId); } catch (e) { throw toTrpcError(e); } }),
    }),

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

    /** Auftragsübergreifender Bedarf: gesammelt aus allen Aufträgen + Muster-Leihen. */
    demandProposals: roleProcedure(...supplierRoles).query(async ({ ctx }) => ctx.reorder.demandProposals()),

    /** Bestellvorschlag aller offenen Aufträge, sortiert nach Marke → Artikel → Farbe → Größe. */
    demandGrouped: roleProcedure(...supplierRoles).query(async ({ ctx }) => ctx.reorder.demandGrouped()),

    /** Erzeugt aus dem Vorschlag je Lieferant eine Bestellung (Kap. 6.1). */
    createPurchaseOrders: roleProcedure("ADMIN", "BUERO").mutation(async ({ ctx }) =>
      ctx.reorder.createPurchaseOrders()
    ),
  }),

  // Transferdruck-Bezug (Inhouse-Veredelung, Kap. 5.4/11): Lager TRANSFERDRUCK zuerst,
  // Fehlmenge beim Material-Lieferanten nachbestellen. EK-Preise → kein PRODUKTION-Zugriff.
  transfers: router({
    /** Bezugsvorschau je Transferartikel (Bedarf/verfügbar/Lager/Bestellung) — ohne Buchung. */
    preview: roleProcedure(...supplierRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.transferSourcing.preview(input.orderId); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    /** Stößt den Bezug an: reserviert aus dem Lager + bestellt die Fehlmengen nach. */
    source: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.transferSourcing.source(input.orderId); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
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

    /** Angebots-Erfolgsquote / Conversion (Kap. 35.1): gewonnen/verloren/offen + Verlustgründe. */
    quoteConversion: roleProcedure(...supplierRoles)
      .input(z.object({ ...rangeShape }).optional())
      .query(async ({ input, ctx }) => ctx.reporting.quoteConversion(toRange(input ?? {}))),

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

  // DATEV-Buchungsstapel-Export (Kap. 9.2, T-07): Periode → CSV (Rechnungen SOLL +
  // Gutschriften HABEN). Finanzdaten → kein PRODUKTION-Zugriff (Kap. 12).
  datev: router({
    export: roleProcedure("ADMIN", "BUCHHALTUNG")
      .input(z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        kontenrahmen: z.enum(["SKR03", "SKR04"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.datevExport.export({ from: new Date(input.from), to: new Date(input.to), kontenrahmen: input.kontenrahmen });
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
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

  // Auftrag → Produktionsauftrag (PA) + Freigabe (Kap. 5.2). Schreibt Status/Stammdaten →
  // kein PRODUKTION-Zugriff auf die Erzeugung; der Laufzettel-PDF läuft über productionSheet.
  // Qualitätssicherung als Gate vor dem Versand (Kap. 20): Stückzahl + externe Veredelung
  // kontrollieren, Foto. PRODUKTION darf prüfen (keine Preis-/Kundendaten).
  quality: router({
    get: roleProcedure("ADMIN", "BUERO", "PRODUKTION")
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.quality.get(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    check: roleProcedure("ADMIN", "BUERO", "PRODUKTION")
      .input(z.object({
        orderId: z.string().min(1),
        stueckzahlOk: z.boolean().optional(),
        veredelungOk: z.boolean().optional(),
        fotoOk: z.boolean().optional(),
        notiz: z.string().nullish(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { orderId, ...patch } = input;
        try { return await ctx.quality.check(orderId, patch); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  production: router({
    status: roleProcedure(...supplierRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.production.status(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    release: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Freigabe-Gate (K-10): über der Rabatt-/Wertgrenze nur durch die Geschäftsleitung.
          const s = await ctx.settings.get();
          await ctx.production.release(input.orderId, {
            role: ctx.user.role,
            thresholds: { maxDiscountPct: s.maxDiscountPct, maxOrderValueCents: s.maxOrderValueEuro === null ? null : Math.round(s.maxOrderValueEuro * 100) },
          });
          return { ok: true as const };
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Terminvorschlag (Werktage-Rückwärtsterminierung) je Veredelungsweg — manuell zu bestätigen.
    schedulePreview: roleProcedure(...supplierRoles)
      .input(z.object({ orderId: z.string().min(1), profile: z.enum(["INHOUSE_OHNE_TRANSFER", "INHOUSE_MIT_TRANSFER", "EXTERN_STICK_SIEBDRUCK", "EXTERN_UND_INTERN"]) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.production.previewSchedule(input.orderId, input.profile); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    createFromOrder: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        orderId: z.string().min(1),
        dueDate: z.string().datetime().nullish(),
        profile: z.enum(["INHOUSE_OHNE_TRANSFER", "INHOUSE_MIT_TRANSFER", "EXTERN_STICK_SIEBDRUCK", "EXTERN_UND_INTERN"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const opts: { dueDate?: Date | null; profile?: typeof input.profile } = {};
          if (input.dueDate !== undefined) opts.dueDate = input.dueDate ? new Date(input.dueDate) : null;
          if (input.profile) opts.profile = input.profile;
          return await ctx.production.createFromOrder(input.orderId, opts);
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Artikel/Varianten-Stammdaten (B16): anlegen/auflisten (Farbe×Größe).
  products: router({
    listArticles: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.products.listArticles()),
    /** Flacher Artikel-/Varianten-Katalog für den Picker in Angebot/Auftrag/Leihgut. */
    catalog: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.products.catalog()),
    /** Serverseitige, begrenzte Katalogsuche (skalierbarer Picker bei vielen Varianten). */
    searchCatalog: roleProcedure(...supplierRoles)
      .input(z.object({ query: z.string().default(""), limit: z.number().int().positive().max(200).optional() }))
      .query(({ input, ctx }) => ctx.products.searchCatalog(input.query, input.limit ?? 50)),
    listVariants: roleProcedure(...supplierRoles)
      .input(z.object({ articleId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.products.listVariants(input.articleId)),
    createArticle: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ sku: z.string().min(1), name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.createArticle(input.sku, input.name); } catch (e) { throw toTrpcError(e); }
      }),
    // Schnellanlage aus dem Picker: Artikel + Basis-Variante in einem Schritt, sofort wählbar.
    quickCreate: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        attributes: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.quickCreateCatalogEntry(input); } catch (e) { throw toTrpcError(e); }
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
    // Matrixprodukt (Xentral-Vorbild): ausgewähltes Farbe×Größe-Raster anlegen (idempotent).
    generateMatrix: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        articleId: z.string().min(1),
        combos: z.array(z.object({ farbe: z.string().min(1), groesse: z.string().min(1) })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.generateMatrix(input.articleId, input.combos); } catch (e) { throw toTrpcError(e); }
      }),
    // Logo/Veredelung als wiederverwendbaren Artikel anlegen (Pflicht-Veredler + eigene Staffel).
    createVeredelung: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        method: z.enum(["STICK", "DRUCK", "DRUCK_DIGITAL", "TRANSFER"]),
        placement: z.string().optional(),
        // Mehrere Platzierungen je Logo (z. B. Brust + Rücken) → je eine Veredelungs-Spezifikation.
        placements: z.array(z.string()).optional(),
        // Optional: leer = inhouse-Veredelung (keine Fremdvergabe).
        veredlerId: z.string().optional(),
        // Material-Dienstleister bei Inhouse (z. B. Transfer-Lieferant) → Beschaffungsbedarf.
        materialLieferantId: z.string().optional(),
        ekCents: z.number().int().nonnegative().optional(),
        tiers: z.array(z.object({ minMenge: z.number().int().positive(), vkCents: z.number().int().nonnegative() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.createVeredelungArticle(input); }
        catch (e) {
          // Doppelte SKU (Prisma P2002) → sauberer 409 CONFLICT statt Server-Crash (500).
          if ((e as { code?: string }).code === "P2002") {
            throw new TRPCError({ code: "CONFLICT", message: `Artikel-Nr. „${input.sku}" existiert bereits — bitte eine andere SKU wählen.` });
          }
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }
      }),
    // Set/Bundle-Stückliste (Kap. 5.1): Komponenten einer Variante lesen/setzen.
    components: roleProcedure(...supplierRoles)
      .input(z.object({ variantId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.products.listComponents(input.variantId)),
    setComponents: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        variantId: z.string().min(1),
        components: z.array(z.object({ description: z.string().min(1), qty: z.number().int().positive(), componentVariantId: z.string().nullish() })),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.products.setComponents(input.variantId, input.components); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
    // Schnellbearbeitung: ein Artikel, beliebige PIM-/Stammfelder.
    updateArticle: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        id: z.string().min(1),
        patch: z.object({
          name: z.string().optional(), description: z.string().optional(), brand: z.string().optional(),
          materialComposition: z.string().optional(), careInstructions: z.string().optional(),
          hsCode: z.string().optional(), originCountry: z.string().optional(),
          // ERPNext-Item-Angleichung (Textil-Subset).
          itemGroup: z.string().optional(), stockUom: z.string().optional(),
          isSalesItem: z.boolean().optional(), isPurchaseItem: z.boolean().optional(),
          minOrderQty: z.number().int().nonnegative().nullable().optional(),
          maxDiscountPct: z.number().int().min(0).max(100).nullable().optional(),
          leadTimeDays: z.number().int().nonnegative().nullable().optional(),
          gender: z.string().optional(), gm2: z.number().int().nonnegative().nullable().optional(), styleFit: z.string().optional(),
          // Bestandsführung als Eigenschaft (Procure-to-Order).
          bestandsgefuehrt: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.products.updateArticle(input.id, input.patch); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
    // Bestandsführung je Variante übersteuern (null = erbt vom Hauptartikel).
    setVariantStockManaged: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ variantId: z.string().min(1), value: z.boolean().nullable() }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.products.setVariantStockManaged(input.variantId, input.value); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
    // Massenbearbeitung: ein Feld-Patch auf viele Artikel (per SKU).
    bulkUpdateArticles: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        skus: z.array(z.string().min(1)).min(1),
        patch: z.object({
          brand: z.string().optional(), materialComposition: z.string().optional(),
          careInstructions: z.string().optional(), hsCode: z.string().optional(), originCountry: z.string().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.products.bulkUpdateArticles(input.skus, input.patch); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Matrixprodukt-Grundtabelle (Xentral-Vorbild): globaler Farb-/Größen-Stamm ("Gruppe"=Achse,
  // "Option"=Wert) + Größenlauf-Vorlagen. Versorgt den Matrix-Editor am Artikel.
  matrix: router({
    axisValues: roleProcedure(...supplierRoles)
      .input(z.object({ axis: z.enum(["FARBE", "GROESSE"]).optional(), includeInactive: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => ctx.matrix.listAxisValues(input?.axis, input?.includeInactive ?? false)),
    createAxisValue: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        axis: z.enum(["FARBE", "GROESSE"]),
        value: z.string().min(1),
        skuSuffix: z.string().nullish(),
        hex: z.string().nullish(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.matrix.createAxisValue(input); } catch (e) { throw toTrpcError(e); }
      }),
    updateAxisValue: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        id: z.string().min(1),
        patch: z.object({
          value: z.string().min(1).optional(),
          skuSuffix: z.string().nullish(),
          hex: z.string().nullish(),
          sortOrder: z.number().int().optional(),
          active: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.matrix.updateAxisValue(input.id, input.patch); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
    sizeRuns: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.matrix.listSizeRuns()),
    saveSizeRun: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ name: z.string().min(1), values: z.array(z.string().min(1)).min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.matrix.saveSizeRun(input.name, input.values); } catch (e) { throw toTrpcError(e); }
      }),
    deleteSizeRun: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.matrix.deleteSizeRun(input.id); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Matrixprodukt-Import (Säule B): flache Lieferanten-CSV → Hauptartikel + Farbe×Größe-Raster
  // (+ optional EK je Lieferant). EK-Preise → kein PRODUKTION-Zugriff (Kap. 12).
  matrixImport: router({
    preview: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ csv: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.matrixImport.preview(input.csv); } catch (e) { throw toTrpcError(e); }
      }),
    run: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ csv: z.string().min(1), ekSupplierId: z.string().min(1).optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.matrixImport.apply(input.csv, input.ekSupplierId ? { ek: { supplierId: input.ekSupplierId } } : {}); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Angebote (B8): auflisten + Entwurf anlegen + Status weiterschalten + ablehnen.
  quotes: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.quotes.list()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        companyId: z.string().min(1),
        gueltigBisAm: z.string().datetime().optional(),
        orderType: z.enum(["SALES", "MAINTENANCE", "SHOPPING_CART"]).optional(),
        quotationTo: z.enum(["CUSTOMER", "LEAD"]).optional(),
        terms: z.string().optional(),
        zahlungszielTage: z.number().int().min(0).max(365).nullish(),
        incoterm: z.string().max(40).nullish(),
        versandregel: z.string().max(80).nullish(),
        lines: z.array(z.object({ description: z.string().min(1), qty: z.number().int().positive(), unitNetCents: z.number().int().nonnegative(), listNetCents: z.number().int().nonnegative().optional(), rabattPct: z.number().int().min(0).max(100).optional(), taxRatePct: z.number().int().min(0).max(100).optional(), kind: z.enum(["TEXTIL", "VEREDELUNG", "SONSTIGE"]).optional(), articleId: z.string().optional(), variantId: z.string().optional(), isAlternative: z.boolean().optional(), bezugPosition: z.number().int().positive().optional(), dbCents: z.number().int().optional() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.quotes.create({ ...input, gueltigBisAm: input.gueltigBisAm ? new Date(input.gueltigBisAm) : null }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Angebot für die Bearbeitung laden (Kopf + Positionen).
    forEdit: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.quotes.getForEdit(input.id); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Vollständige Bearbeitung (Kopf + Positionen), solange nicht in Auftrag gewandelt.
    update: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        id: z.string().min(1),
        companyId: z.string().min(1),
        gueltigBisAm: z.string().datetime().optional(),
        orderType: z.enum(["SALES", "MAINTENANCE", "SHOPPING_CART"]).optional(),
        quotationTo: z.enum(["CUSTOMER", "LEAD"]).optional(),
        terms: z.string().optional(),
        zahlungszielTage: z.number().int().min(0).max(365).nullish(),
        incoterm: z.string().max(40).nullish(),
        versandregel: z.string().max(80).nullish(),
        lines: z.array(z.object({ description: z.string().min(1), qty: z.number().int().positive(), unitNetCents: z.number().int().nonnegative(), listNetCents: z.number().int().nonnegative().optional(), rabattPct: z.number().int().min(0).max(100).optional(), taxRatePct: z.number().int().min(0).max(100).optional(), kind: z.enum(["TEXTIL", "VEREDELUNG", "SONSTIGE"]).optional(), articleId: z.string().optional(), variantId: z.string().optional(), isAlternative: z.boolean().optional(), bezugPosition: z.number().int().positive().optional(), dbCents: z.number().int().optional() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...rest } = input;
        try { await ctx.quotes.update(id, { ...rest, gueltigBisAm: input.gueltigBisAm ? new Date(input.gueltigBisAm) : null }); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    transition: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), to: z.enum(["VERSENDET", "NACHFASSEN", "ANGENOMMEN"]) }))
      .mutation(async ({ input, ctx }) => {
        try {
          await ctx.quotes.transition(input.id, input.to);
          // GoBD: versendetes Angebot unveränderbar archivieren (WORM).
          if (input.to === "VERSENDET") await autoArchive(ctx, "ANGEBOT", "Quote", input.id, () => ctx.print.quotePdf(input.id));
          return { ok: true as const };
        }
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
    removeGroupTier: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ companyId: z.string().min(1), variantId: z.string().min(1), minMenge: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.pricing.removeGroupTier(input.companyId, input.variantId, input.minMenge); return { ok: true as const }; }
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
    // PRODUKTION darf eigene Dashboards bauen; Finanzkennzahlen werden serverseitig
    // ausgeblendet/redigiert (canViewFinancials, Kap. 12).
    metrics: roleProcedure(...allRoles).query(({ ctx }) => ctx.dashboards.listMetrics(canViewFinancials(ctx.user.role))),
    listCharts: roleProcedure(...allRoles).query(({ ctx }) => ctx.dashboards.listCharts()),
    listCards: roleProcedure(...allRoles).query(({ ctx }) => ctx.dashboards.listCards()),
    list: roleProcedure(...allRoles).query(({ ctx }) => ctx.dashboards.listForUser(ctx.user.email)),
    resolved: roleProcedure(...allRoles)
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.dashboards.getResolved(input.id, canViewFinancials(ctx.user.role)); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    createChart: roleProcedure(...allRoles)
      .input(z.object({ name: z.string().min(1), chartType: z.enum(["BAR", "LINE", "DONUT"]).default("BAR"), metricKey: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.createChart(input.name, input.chartType, input.metricKey, canViewFinancials(ctx.user.role)); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    createCard: roleProcedure(...allRoles)
      .input(z.object({ name: z.string().min(1), metricKey: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.createCard(input.name, input.metricKey, canViewFinancials(ctx.user.role)); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Persönliches Dashboard: ownerEmail = angemeldete:r Nutzer:in; shared = null (per Flag).
    createDashboard: roleProcedure(...allRoles)
      .input(z.object({ name: z.string().min(1), shared: z.boolean().default(false) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.createDashboard(input.name, input.shared ? null : ctx.user.email); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    addItem: roleProcedure(...allRoles)
      .input(z.object({ dashboardId: z.string().min(1), kind: z.enum(["CHART", "CARD"]), refId: z.string().min(1), width: z.enum(["FULL", "HALF"]).default("HALF") }))
      .mutation(({ input, ctx }) => ctx.dashboards.addItem(input.dashboardId, input.kind, input.refId, input.width)),
    removeItem: roleProcedure(...allRoles)
      .input(z.object({ itemId: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.dashboards.removeItem(input.itemId)),
    moveItem: roleProcedure(...allRoles)
      .input(z.object({ itemId: z.string().min(1), direction: z.enum(["UP", "DOWN"]) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.dashboards.moveItem(input.itemId, input.direction); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    setDefault: roleProcedure(...allRoles)
      .input(z.object({ dashboardId: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.dashboards.setDefault(input.dashboardId, ctx.user.email)),
  }),

  // Stammdaten-Im-/Export (CSV): Artikel, Kunden, Lieferanten — Migration + Pflege.
  // Kundendaten/Stammdaten → kein PRODUKTION-Zugriff (Kap. 12).
  dataIo: router({
    exportCsv: roleProcedure(...supplierRoles)
      .input(z.object({ kind: z.enum(["ARTICLE", "COMPANY", "SUPPLIER"]) }))
      .query(({ input, ctx }) => ctx.dataIo.exportCsv(input.kind)),
    importCsv: roleProcedure(...supplierRoles)
      .input(z.object({ kind: z.enum(["ARTICLE", "COMPANY", "SUPPLIER"]), csv: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.dataIo.importCsv(input.kind, input.csv)),
  }),

  // Verkaufschancen / Pipeline (komplexes CRM): gewichteter Forecast, Gewinn/Verlust.
  // Vertriebsdaten → kein PRODUKTION-Zugriff (Kap. 12).
  opportunities: router({
    list: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.opportunities.list()),
    pipeline: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.opportunities.pipeline()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        title: z.string().min(1), companyId: z.string().optional(),
        stage: z.enum(["QUALIFIZIERUNG", "ANGEBOT", "VERHANDLUNG", "ABSCHLUSS"]).optional(),
        valueCents: z.number().int().min(0).optional(), probability: z.number().int().min(0).max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.opportunities.create(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    advanceStage: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), stage: z.enum(["QUALIFIZIERUNG", "ANGEBOT", "VERHANDLUNG", "ABSCHLUSS"]) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.opportunities.advanceStage(input.id, input.stage); return { ok: true as const }; } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    markWon: roleProcedure("ADMIN", "BUERO").input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { try { await ctx.opportunities.markWon(input.id); return { ok: true as const }; } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); } }),
    markLost: roleProcedure("ADMIN", "BUERO").input(z.object({ id: z.string().min(1), reason: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { try { await ctx.opportunities.markLost(input.id, input.reason); return { ok: true as const }; } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); } }),
  }),

  // Connector-Plattform: zentrale Registry aller Fremdsystem-Anbindungen. Nur ADMIN.
  integrations: router({
    list: roleProcedure("ADMIN").query(({ ctx }) => ctx.integrations.list()),
    configure: roleProcedure("ADMIN")
      .input(z.object({
        kind: z.enum(["WOOCOMMERCE", "DPD", "BREVO", "HUBSPOT", "SLACK", "SUPPLIER", "CALDAV"]),
        enabled: z.boolean(),
        config: z.record(z.string(), z.string()),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.integrations.configure(input.kind, input.enabled, input.config); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    test: roleProcedure("ADMIN")
      .input(z.object({ kind: z.enum(["WOOCOMMERCE", "DPD", "BREVO", "HUBSPOT", "SLACK", "SUPPLIER", "CALDAV"]) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.integrations.test(input.kind); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Personalwesen (HR): Mitarbeiter + Urlaubsanträge. Nur Geschäftsleitung (ADMIN).
  hr: router({
    employees: roleProcedure("ADMIN").query(({ ctx }) => ctx.hr.listEmployees()),
    addEmployee: roleProcedure("ADMIN")
      .input(z.object({ name: z.string().min(1), email: z.string().min(3), position: z.string().optional(), urlaubstageJahr: z.number().int().min(0).optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.hr.addEmployee(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    vacations: roleProcedure("ADMIN").query(({ ctx }) => ctx.hr.listVacations()),
    requestVacation: roleProcedure("ADMIN")
      .input(z.object({ employeeId: z.string().min(1), vonDatum: z.string().datetime(), bisDatum: z.string().datetime(), grund: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.hr.requestVacation({ employeeId: input.employeeId, vonDatum: new Date(input.vonDatum), bisDatum: new Date(input.bisDatum), grund: input.grund }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    decideVacation: roleProcedure("ADMIN")
      .input(z.object({ id: z.string().min(1), approve: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.hr.decideVacation(input.id, input.approve); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Schlanke Lagerhaltung + Inventur (F4-Ledger): Bestandsübersicht je Lager,
  // Lager-Stammdaten (Multi-Lager Stufe 1): beliebige Läger statt festes Enum.
  warehouses: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.warehouses.list()),
    balances: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.warehouses.balances()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        code: z.string().min(1),
        name: z.string().optional(),
        kind: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK", "SONSTIGE"]).optional(),
        parentId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => { try { return await ctx.warehouses.create(input); } catch (e) { throw toTrpcError(e); } }),
    setActive: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => { await ctx.warehouses.setActive(input.id, input.active); return { ok: true as const }; }),
  }),

  // manuelle Bewegung (Zugang/Abgang), Inventur-Zählung (bucht Differenz).
  stock: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.stock.listBalances()),
    // Bestandsbewegungs-Journal (F4): das append-only Ledger lesbar machen (neueste zuerst).
    moves: roleProcedure(...supplierRoles)
      .input(z.object({ variantId: z.string().optional(), lager: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"]).optional(), limit: z.number().int().positive().max(500).optional() }).optional())
      .query(({ input, ctx }) => ctx.stock.listMoves({ variantId: input?.variantId, lager: input?.lager, limit: input?.limit })),
    move: roleProcedure(...supplierRoles)
      .input(z.object({
        variantId: z.string().min(1), deltaQty: z.number().int(),
        lager: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"]).default("HAUPT"),
        warehouseId: z.string().optional(), // Multi-Lager 2b: beliebiges Lager (Vorrang vor lager)
        grund: z.enum(["EROEFFNUNG", "WARENEINGANG", "VERBRAUCH", "INVENTUR", "KORREKTUR", "MUSTER"]).default("KORREKTUR"),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.stock.post(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    inventur: roleProcedure(...supplierRoles)
      .input(z.object({ variantId: z.string().min(1), countedQty: z.number().int().min(0), lager: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"]).default("SHOWROOM") }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.inventory.recordCount(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    // Verfügbarkeit (Ist − reserviert), Vormerkung gegen Aufträge, Meldebestände.
    availability: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.reservations.availability()),
    // Shop-Bestand (Pseudo-Bestand): gemeldeter Bestand = verfügbar(HAUPT) − Puffer (≥ 0).
    shopStock: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.reservations.shopStock()),
    setShopPuffer: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ variantId: z.string().min(1), puffer: z.number().int().min(0) }))
      .mutation(async ({ input, ctx }) => { await ctx.reservations.setShopPuffer(input.variantId, input.puffer); return { ok: true as const }; }),
    reservations: roleProcedure(...supplierRoles)
      .input(z.object({ variantId: z.string().optional(), orderId: z.string().optional(), status: z.enum(["AKTIV", "ERLEDIGT", "STORNIERT"]).optional(), lager: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"]).optional() }).optional())
      .query(({ input, ctx }) => ctx.reservations.listReservations(input)),
    reserve: roleProcedure(...supplierRoles)
      .input(z.object({
        variantId: z.string().min(1),
        lager: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"]).default("HAUPT"),
        qty: z.number().int().positive(),
        orderId: z.string().nullable().optional(),
        belegRef: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => { try { return await ctx.reservations.reserve(input); } catch (e) { throw toTrpcError(e); } }),
    release: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1), status: z.enum(["ERLEDIGT", "STORNIERT"]).default("STORNIERT") }))
      .mutation(async ({ input, ctx }) => { try { await ctx.reservations.release(input.id, input.status); return { ok: true as const }; } catch (e) { throw toTrpcError(e); } }),
    thresholds: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.reservations.listThresholds()),
    setThreshold: roleProcedure(...supplierRoles)
      .input(z.object({ variantId: z.string().min(1), lager: z.enum(["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"]).default("TRANSFERDRUCK"), minQty: z.number().int() }))
      .mutation(async ({ input, ctx }) => { try { await ctx.reservations.setThreshold(input.variantId, input.lager, input.minQty); return { ok: true as const }; } catch (e) { throw toTrpcError(e); } }),
    /** Meldebestände prüfen + bei Neu-Unterschreitung benachrichtigen (manuell/Cron). */
    checkLowStock: roleProcedure(...supplierRoles).mutation(({ ctx }) => ctx.reservations.checkLowStock()),
    /** „Wann bestellt / wann eingelagert" je Artikel (Scheibe 2). */
    supplyTimeline: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.reservations.supplyTimeline()),
  }),

  // Admin-Portal: zentrale Einstellungen (Briefkopf, Freigabeschwellen, Aufschlag).
  // Nur ADMIN (Geschäftsleitung).
  settings: router({
    get: roleProcedure("ADMIN").query(({ ctx }) => ctx.settings.get()),
    /** Standard-Siebdruck-Veredler (Lieferant-ID) — operativ lesbar für die Vorbelegung. */
    siebdruckVeredler: protectedProcedure.query(({ ctx }) => ctx.settings.siebdruckVeredlerId()),
    /** Globaler USt-Satz — operativ lesbar für die Vorbelegung der Positionssummen. */
    defaultTaxRate: protectedProcedure.query(({ ctx }) => ctx.settings.defaultTaxRatePct()),
    update: roleProcedure("ADMIN")
      .input(z.object({
        briefkopf: z.array(z.string()).optional(),
        maxDiscountPct: z.number().min(0).max(100).nullable().optional(),
        maxOrderValueEuro: z.number().min(0).nullable().optional(),
        markupFactor: z.number().positive().optional(),
        siebdruckVeredlerId: z.string().nullable().optional(),
        defaultTaxRatePct: z.number().int().min(0).max(100).optional(),
        // Firmenprofil für Belegkopf/-fuß (Teil-Update der einzelnen Felder).
        companyProfile: z.object({
          name: z.string(), street: z.string(), zipCity: z.string(),
          tel: z.string(), mail: z.string(), web: z.string(),
          ustId: z.string(), gf: z.string(),
          bankName: z.string(), iban: z.string(), bic: z.string(),
        }).partial().optional(),
        // Firmenlogo (JPEG base64) für den Belegkopf; "" = Default-Logo.
        companyLogoB64: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.settings.update(input); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Auftrags-Workflow / Statusverwaltung: Produktionsroute zuweisen + Schritt für
  // Schritt weiterschalten (4 Routen je Veredelungsart). Operativ → kein PRODUKTION-
  // Preiszugriff betroffen; ADMIN/BUERO steuern, PRODUKTION sieht (status read offen).
  workflow: router({
    status: protectedProcedure
      .input(z.object({ orderId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.workflow.status(input.orderId)),
    assignRoute: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1), route: z.enum(["ROUTE1_KEINE", "ROUTE2_INTERN", "ROUTE3_EXTERN", "ROUTE4_EXTERN_INTERN"]).optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.workflow.assignRoute(input.orderId, input.route); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    advance: roleProcedure("ADMIN", "BUERO", "PRODUKTION")
      .input(z.object({ orderId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.workflow.advance(input.orderId, ctx.user.email); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Workflow-Aktion AB_DRUCKFREIGABE: Auftragsbestätigung mit Druckfreigabe senden.
    sendAuftragsbestaetigung: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const res = await ctx.workflow.sendAuftragsbestaetigung(input.orderId, ctx.user.email);
          // GoBD: versendete Auftragsbestätigung unveränderbar archivieren (WORM).
          await autoArchive(ctx, "AUFTRAGSBESTAETIGUNG", "Auftragsbestaetigung", input.orderId, () => ctx.print.auftragsbestaetigungPdf(input.orderId));
          return res;
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Büro-Kalender (Terminmanagement): Termine/Urlaub/Abwesenheiten — eigene + geteilte.
  calendar: router({
    list: protectedProcedure
      .input(z.object({ from: z.string().datetime(), to: z.string().datetime() }))
      .query(({ input, ctx }) => ctx.calendar.listForUser(ctx.user.email, new Date(input.from), new Date(input.to))),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1), shared: z.boolean().default(false),
        kind: z.enum(["TERMIN", "URLAUB", "ABWESENHEIT", "SONSTIGES"]).default("TERMIN"),
        start: z.string().datetime(), end: z.string().datetime(), allDay: z.boolean().default(false), note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.calendar.create({ ...input, ownerEmail: ctx.user.email, start: new Date(input.start), end: new Date(input.end) }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        kind: z.enum(["TERMIN", "URLAUB", "ABWESENHEIT", "SONSTIGES"]).optional(),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        allDay: z.boolean().optional(),
        note: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, start, end, ...rest } = input;
        const patch = { ...rest, ...(start !== undefined ? { start: new Date(start) } : {}), ...(end !== undefined ? { end: new Date(end) } : {}) };
        try {
          await ctx.calendar.update(id, ctx.user.email, patch);
          // Zwei-Wege-Sync: ist der Termin an eine Aufgabe gebunden und wurde verschoben,
          // die Fälligkeit der Aufgabe zurückschreiben (Aufgabe ist die Quelle der Wahrheit).
          if (start !== undefined) {
            const ev = await ctx.calendar.loadById(id);
            if (ev?.sourceEntity === "task" && ev.sourceId) {
              await ctx.tasks.update(ev.sourceId, { dueDate: new Date(start) }, ctx.user.id);
            }
          }
          return { ok: true as const };
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.calendar.remove(input.id, ctx.user.email); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
  }),

  // Mitarbeiter-Nachrichtenportal: internes Postfach (Eingang/Ausgang, gelesen).
  messages: router({
    inbox: protectedProcedure.query(({ ctx }) => ctx.messages.inbox(ctx.user.email)),
    sent: protectedProcedure.query(({ ctx }) => ctx.messages.sent(ctx.user.email)),
    unreadCount: protectedProcedure.query(({ ctx }) => ctx.messages.unreadCount(ctx.user.email)),
    send: protectedProcedure
      .input(z.object({ toEmail: z.string().min(1), subject: z.string().min(1), body: z.string().default("") }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.messages.send(ctx.user.email, input.toEmail, input.subject, input.body); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    markRead: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.messages.markRead(input.id, ctx.user.email); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
  }),

  // Newsletter (Brevo): Kampagnen anlegen + an Opt-in-Kontakte versenden (DSGVO).
  // Kundendaten/Marketing → kein PRODUKTION-Zugriff (Kap. 12).
  newsletter: router({
    list: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.newsletter.listCampaigns()),
    audienceSize: roleProcedure("ADMIN", "BUERO").query(({ ctx }) => ctx.newsletter.audienceSize()),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ subject: z.string().min(1), body: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.newsletter.createCampaign(input.subject, input.body); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    send: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ campaignId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.newsletter.send(input.campaignId); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Mailanbindung: Posteingang abrufen (IMAP) und Mails in Anfragen wandeln, mit
  // Abgleich der Absenderadresse gegen die Kundenstammdaten (Kontakte). Kundendaten →
  // kein PRODUKTION-Zugriff (Kap. 12).
  mail: router({
    pollInbox: roleProcedure("ADMIN", "BUERO").mutation(({ ctx }) => ctx.mailIntake.pollInbox()),
    // Test-Versand über den konfigurierten SMTP-Zugang (IONOS) — Verbindungsprüfung.
    sendTest: roleProcedure("ADMIN")
      .input(z.object({ to: z.string().min(3), subject: z.string().default("TEXMA ERP — Testmail"), body: z.string().default("SMTP-Anbindung erfolgreich.") }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.mailSend.send({ to: input.to, subject: input.subject, body: input.body }); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Beleg (Angebot/AB/Rechnung) als PDF-Anhang per E-Mail senden. Preis-sensibel → supplierRoles.
    sendBeleg: roleProcedure(...supplierRoles)
      .input(z.object({
        // Alle Kunden-Belege: jeder mit eigenem PDF ist auch per Mail versendbar.
        kind: z.enum(["QUOTE", "AUFTRAGSBESTAETIGUNG", "INVOICE", "LIEFERSCHEIN", "GUTSCHRIFT", "MAHNUNG", "LEIHGUT"]),
        id: z.string().min(1),
        // Bewusst nur z.string(): die E-Mail-Plausibilität prüfen wir im Handler mit
        // klarer deutscher Meldung, statt den rohen Zod-„invalid_string"-Fehler ans UI zu reichen.
        to: z.string(),
        subject: z.string().optional(),
        body: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Empfänger zuerst sauber prüfen — leer/ungültig → verständliche Rückmeldung.
        const to = input.to.trim();
        if (!to) throw new TRPCError({ code: "BAD_REQUEST", message: "Bitte eine Empfänger-E-Mail angeben." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new TRPCError({ code: "BAD_REQUEST", message: `„${to}" ist keine gültige E-Mail-Adresse.` });
        try {
          const pdf = await belegPdf(ctx, input.kind, input.id);
          const def = await belegMailText(ctx, input.kind, input.id, pdf.filename);
          const subject = input.subject ?? def.subject;
          const body = input.body ?? def.body;
          await ctx.mailSend.send({ to, subject, body, attachments: [{ filename: pdf.filename, contentBase64: pdf.base64, contentType: "application/pdf" }] });
          return { ok: true as const, filename: pdf.filename };
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Empfänger-E-Mail eines Belegs (Firma) — zum Vorbefüllen des „Direkt senden"-Dialogs,
    // ohne das PDF zu erzeugen. Leerer String, wenn keine Adresse hinterlegt ist.
    belegRecipient: roleProcedure(...supplierRoles)
      .input(z.object({ kind: z.enum(["QUOTE", "AUFTRAGSBESTAETIGUNG", "INVOICE", "LIEFERSCHEIN", "GUTSCHRIFT", "MAHNUNG", "LEIHGUT"]), id: z.string().min(1) }))
      .query(async ({ input, ctx }) => ({ to: (await ctx.print.recipientEmailForBeleg(input.kind, input.id))?.trim() ?? "" })),
    // Outlook-Entwurf statt SMTP-Direktversand: liefert Empfänger (aus Kontakt), Betreff, Text
    // und das Beleg-PDF gebündelt. Das Frontend baut daraus eine .eml und öffnet sie in Outlook —
    // der Sachbearbeiter prüft und versendet selbst. `to` kann "" sein (keine Kontakt-Mail
    // hinterlegt) → das Frontend zeigt einen Hinweis. Preis-sensibel → supplierRoles.
    buildDraft: roleProcedure(...supplierRoles)
      .input(z.object({
        kind: z.enum(["QUOTE", "AUFTRAGSBESTAETIGUNG", "INVOICE", "LIEFERSCHEIN", "GUTSCHRIFT", "MAHNUNG", "LEIHGUT"]),
        id: z.string().min(1),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const pdf = await belegPdf(ctx, input.kind, input.id);
          const { subject, body } = await belegMailText(ctx, input.kind, input.id, pdf.filename);
          const to = (await ctx.print.recipientEmailForBeleg(input.kind, input.id))?.trim() ?? "";
          return { to, subject, body, pdf: { filename: pdf.filename, base64: pdf.base64 } };
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Outlook-Entwurf für den Veredelungsauftrag (an den Veredler). Empfänger default =
    // hinterlegte Veredler-E-Mail (Supplier.email). Ohne Preise → allRoles.
    buildVeredelungsauftragDraft: roleProcedure(...allRoles)
      .input(z.object({ subProductionId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try {
          const pdf = await ctx.print.veredelungsauftragPdf(input.subProductionId);
          const nr = belegNummerAusDateiname(pdf.filename);
          const to = (await ctx.suppliers.emailForSubProduction(input.subProductionId))?.trim() ?? "";
          const subject = `Veredelungsauftrag ${nr}`;
          const body = `Guten Tag,\n\nanbei erhalten Sie unseren Veredelungsauftrag ${nr} mit der Größenaufstellung der Beistellung und den Veredelungspositionen.\n\nBitte bestätigen Sie uns den Eingang sowie den Fertigstellungstermin.\n\nMit freundlichen Grüßen\nTEXMA Textilmarketing GmbH`;
          return { to, subject, body, pdf: { filename: pdf.filename, base64: pdf.base64 } };
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Veredelungsauftrag (Werkstattblatt) als PDF-Anhang an den Veredler senden. Ohne Preise →
    // allRoles. Empfänger default = hinterlegte Veredler-E-Mail (Supplier.email), überschreibbar.
    sendVeredelungsauftrag: roleProcedure(...allRoles)
      .input(z.object({ subProductionId: z.string().min(1), to: z.string().optional(), subject: z.string().optional(), body: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const veredlerMail = await ctx.suppliers.emailForSubProduction(input.subProductionId);
        const to = (input.to?.trim() || veredlerMail || "").trim();
        if (!to) throw new TRPCError({ code: "BAD_REQUEST", message: "Keine Empfänger-E-Mail: beim Veredler eine E-Mail hinterlegen oder eine Adresse angeben." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new TRPCError({ code: "BAD_REQUEST", message: `„${to}" ist keine gültige E-Mail-Adresse.` });
        try {
          const pdf = await ctx.print.veredelungsauftragPdf(input.subProductionId);
          const nr = pdf.filename.replace(/\.pdf$/, "").replace(/^[^-]+-/, "");
          const subject = input.subject ?? `Veredelungsauftrag ${nr}`;
          const body = input.body ?? `Guten Tag,\n\nanbei erhalten Sie unseren Veredelungsauftrag ${nr} mit der Größenaufstellung der Beistellung und den Veredelungspositionen.\n\nBitte bestätigen Sie uns den Eingang sowie den Fertigstellungstermin.\n\nMit freundlichen Grüßen\nTEXMA Textilmarketing GmbH`;
          await ctx.mailSend.send({ to, subject, body, attachments: [{ filename: pdf.filename, contentBase64: pdf.base64, contentType: "application/pdf" }] });
          // GoBD: ausgehender Geschäftsbrief an den Veredler unveränderbar archivieren (6 J.).
          await autoArchive(ctx, "GESCHAEFTSBRIEF", "SubProductionOrder", input.subProductionId, () => ctx.print.veredelungsauftragPdf(input.subProductionId));
          return { ok: true as const, filename: pdf.filename, to };
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Auftragserstellung (Vertrieb): manueller Auftrag + Angebot→Auftrag. Schreibt
  // Stammdaten/Preise → kein PRODUKTION-Zugriff (Kap. 12).
  sales: router({
    createOrder: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        companyId: z.string().min(1),
        lines: z.array(z.object({ description: z.string().min(1), qty: z.number().int().positive(), unitNetCents: z.number().int().min(0), listNetCents: z.number().int().min(0).optional(), rabattPct: z.number().int().min(0).max(100).optional(), taxRatePct: z.number().int().min(0).max(100).optional(), kind: z.enum(["TEXTIL", "VEREDELUNG", "SONSTIGE"]).optional(), variantId: z.string().optional(), bezugPosition: z.number().int().positive().optional(), dbCents: z.number().int().optional() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.salesOrders.createManual(input.companyId, input.lines); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Auftrag für die Bearbeitung laden (Positionen + Sperrstatus).
    orderForEdit: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.salesOrders.getOrderForEdit(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Vollständige Bearbeitung (Kunde + Positionen), solange nicht fakturiert/geliefert/in Produktion.
    updateOrder: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        orderId: z.string().min(1),
        companyId: z.string().min(1),
        lines: z.array(z.object({ description: z.string().min(1), qty: z.number().int().positive(), unitNetCents: z.number().int().min(0), listNetCents: z.number().int().min(0).optional(), rabattPct: z.number().int().min(0).max(100).optional(), taxRatePct: z.number().int().min(0).max(100).optional(), kind: z.enum(["TEXTIL", "VEREDELUNG", "SONSTIGE"]).optional(), variantId: z.string().optional(), bezugPosition: z.number().int().positive().optional(), dbCents: z.number().int().optional() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await ctx.salesOrders.updateOrder(input.orderId, input.companyId, input.lines);
          // Bei laufender Produktion die Fertigungsstückliste an die geänderten Positionen anpassen.
          const bom = await ctx.production.rebuildBomForOrder(input.orderId);
          return { ok: true as const, bomRebuilt: bom.rebuilt };
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Umwandlungs-Plan: zeigt je Position, ob ein Hauptartikel (Farbe×Größe noch offen)
    // oder eine konkrete Variante vorliegt; Alternativen sind als solche markiert.
    conversionPlan: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ quoteId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.salesOrders.conversionPlan(input.quoteId); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    convertQuote: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        quoteId: z.string().min(1),
        // Position → gewählte Variante (String) ODER Größenlauf [{variantId, qty}] aus der
        // Varianten-Matrix (Farbe×Größe + Stückzahl je Größe nach Muster-Anprobe).
        resolutions: z.record(
          z.string(),
          z.union([z.string(), z.array(z.object({ variantId: z.string().min(1), qty: z.number().int().positive() }))])
        ).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const resolutions = input.resolutions
            ? Object.fromEntries(Object.entries(input.resolutions).map(([k, v]) => [Number(k), v]))
            : undefined;
          return await ctx.salesOrders.convertQuote(input.quoteId, resolutions);
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Druckerzeugnisse: Lieferschein (ohne Preise → allRoles) und Rechnung (Finanz →
  // supplierRoles). Rückgabe = Dateiname + Base64-PDF zum Download.
  print: router({
    deliveryNote: roleProcedure(...allRoles)
      .input(z.object({ deliveryNoteId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.deliveryNotePdf(input.deliveryNoteId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    sampleLoanLieferschein: roleProcedure(...allRoles)
      .input(z.object({ loanId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.sampleLoanLieferscheinPdf(input.loanId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    invoice: roleProcedure(...supplierRoles)
      .input(z.object({ invoiceId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.invoicePdf(input.invoiceId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Gutschrift-/Storno-PDF (Finanzbeleg → kein PRODUKTION).
    creditNote: roleProcedure(...supplierRoles)
      .input(z.object({ creditNoteId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.creditNotePdf(input.creditNoteId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Mahnungs-PDF (Finanzbeleg → kein PRODUKTION).
    mahnung: roleProcedure(...supplierRoles)
      .input(z.object({ noticeId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.mahnungPdf(input.noticeId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Laufzettel/Produktionszettel zum Auftrag (Workflow-Aktion LAUFZETTEL; ohne Preise → allRoles).
    laufzettel: roleProcedure(...allRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.laufzettelPdf(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Veredelungsauftrag/Werkstattblatt zur Fremdvergabe-/Inhouse-Stufe (Größen-Matrix +
    // Veredelungspositionen; ohne Preise → allRoles inkl. PRODUKTION).
    veredelungsauftrag: roleProcedure(...allRoles)
      .input(z.object({ subProductionId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.veredelungsauftragPdf(input.subProductionId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Angebots-PDF (mit Preisen → kein PRODUKTION).
    quote: roleProcedure(...supplierRoles)
      .input(z.object({ quoteId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.quotePdf(input.quoteId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Anfrage-PDF (Vertriebspipeline): erfasste Positionen einer Kundenanfrage exportieren (mit Preisen → kein PRODUKTION).
    inquiry: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.inquiryPdf(input.id); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Auftragsbestätigungs-PDF (mit Preisen → kein PRODUKTION).
    auftragsbestaetigung: roleProcedure(...supplierRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.auftragsbestaetigungPdf(input.orderId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Kunden-Stammdatenblatt (internes Datenblatt mit Konditionen/Bank → kein PRODUKTION).
    customerDataSheet: roleProcedure(...supplierRoles)
      .input(z.object({ companyId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.customerDataSheetPdf(input.companyId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
    // Lieferanten-Stammdatenblatt (internes Datenblatt mit EK-Konditionen → kein PRODUKTION).
    supplierDataSheet: roleProcedure(...supplierRoles)
      .input(z.object({ supplierId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.print.supplierDataSheetPdf(input.supplierId); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
  }),

  // Verknüpfte Belege („Connections"): alle mit einem Auftrag verbundenen Dokumente.
  // Finanzbelege werden für PRODUKTION ausgeblendet (canViewFinancials, Kap. 12).
  links: router({
    forOrder: roleProcedure(...allRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try { return await ctx.links.forOrder(input.orderId, canViewFinancials(ctx.user.role)); }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
  }),

  // Einheitliche Beleg-/Dokumentliste zu einem Auftrag: {type, label, id, pdfKind, navKey}
  // + GoBD-Archivstatus (archived/archiveId) — speist die Belegkette mit PDF + „Archiviert ✓".
  documents: router({
    forOrder: roleProcedure(...allRoles)
      .input(z.object({ orderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        try {
          const ol = await ctx.links.forOrder(input.orderId, canViewFinancials(ctx.user.role));
          const docs = await Promise.all(ol.links.map(async (l) => {
            const arch = l.id && l.sourceEntity ? await ctx.archive.findLatestBySource(l.sourceEntity, l.id) : null;
            return { type: l.type, label: l.label, id: l.id ?? null, pdfKind: l.pdfKind ?? null, navKey: l.navKey, financial: l.financial, archived: !!arch, archiveId: arch?.id ?? null };
          }));
          return { orderNumber: ol.orderNumber, documents: docs };
        }
        catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
      }),
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
    /** Kunden-Detail + Historie (klickbar im Kundenstamm). */
    overview: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ companyId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.companies.overview(input.companyId)),
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        name: z.string().min(1),
        branche: z.string().optional(),
        zahlungszielTage: z.number().int().min(0).max(180).optional(),
        priceGroupKind: z.enum(["STANDARD", "TOP", "PREMIUM", "WIEDERVERKAEUFER", "AGENTUR"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.companies.create(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    update: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        branche: z.string().optional(),
        zahlungszielTage: z.number().int().min(0).max(180).optional(),
        mahnsperre: z.boolean().optional(),
        // Stammdaten 360° (Paket 1) — null = Feld leeren.
        street: z.string().nullable().optional(),
        zip: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        vatId: z.string().nullable().optional(),
        taxNumber: z.string().nullable().optional(),
        // Steuerregel + Bankverbindung/SEPA (Xentral-Benchmark) — null = Feld leeren.
        taxRule: z.enum(["INLAND", "EU_B2B", "DRITTLAND", "KLEINUNTERNEHMER"]).nullable().optional(),
        iban: z.string().nullable().optional(),
        bic: z.string().nullable().optional(),
        bankName: z.string().nullable().optional(),
        sepaMandateRef: z.string().nullable().optional(),
        sepaMandateDate: z.string().nullable().optional(),
        skontoPercent: z.number().int().min(0).max(100).nullable().optional(),
        skontoDays: z.number().int().min(0).max(180).nullable().optional(),
        paymentMethod: z.enum(["UEBERWEISUNG", "LASTSCHRIFT", "BAR"]).nullable().optional(),
        lieferbedingung: z.string().nullable().optional(),
        notiz: z.string().nullable().optional(),
        kreditlimitCents: z.number().int().min(0).nullable().optional(),
        // Sperren + Zuordnung (Xentral-Benchmark).
        liefersperre: z.boolean().optional(),
        liefersperreGrund: z.string().nullable().optional(),
        debitorenkonto: z.string().nullable().optional(),
        belegsprache: z.enum(["DE", "EN"]).nullable().optional(),
        waehrung: z.string().nullable().optional(),
        betreuer: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.companies.update(input); return { ok: true as const }; } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    // Unbenutzten Kundenstammsatz löschen (Fehleingaben/Test-Müll, P1-4) — nur ohne Belege.
    delete: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.companies.deleteCompany(input.id); return { ok: true as const }; } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
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
    // Mehrartikel-Leihe (Muster/Anprobe, mehrere Lieferanten).
    issueMulti: roleProcedure(...supplierRoles)
      .input(z.object({
        companyId: z.string().min(1), zweck: z.string().optional(), quoteId: z.string().optional(),
        lines: z.array(z.object({ description: z.string().min(1), variantId: z.string().optional(), supplierId: z.string().optional(), menge: z.number().int().positive() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.sampleLoans.issueMulti(input); } catch (e) { throw toTrpcError(e); }
      }),
    // Angebot → Leihgut wandeln (Won-Verzweigung: Muster/Anprobe).
    convertQuote: roleProcedure(...supplierRoles)
      .input(z.object({ quoteId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.sampleLoans.convertQuoteToLoan(input.quoteId); } catch (e) { throw toTrpcError(e); }
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

  // Vereinheitlichter CRM-Funnel (IA-Objekt-Merge): EINE Entität (CrmLead) + EINE Statusmaschine
  // löst Lead/Anfrage/Chance ab. NEU->KONTAKTIERT->QUALIFIZIERT->ANGEBOT->GEWONNEN (+VERLOREN).
  crm: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.crm.list()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({
        name: z.string().min(1),
        companyId: z.string().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        source: z.enum(["WEB", "EMAIL", "SHOP", "TELEFON"]).optional(),
        valueCents: z.number().int().nonnegative().optional(),
        expectedCloseAt: z.string().optional(), // Wunsch-/Zieltermin (ISO)
        text: z.string().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { expectedCloseAt, ...rest } = input;
        try { return await ctx.crm.create({ ...rest, expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : null }); } catch (e) { throw toTrpcError(e); }
      }),
    update: roleProcedure(...supplierRoles)
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        companyId: z.string().nullable().optional(),
        contactName: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        source: z.enum(["WEB", "EMAIL", "SHOP", "TELEFON"]).nullable().optional(),
        valueCents: z.number().int().nonnegative().nullable().optional(),
        expectedCloseAt: z.string().nullable().optional(),
        text: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        // Konkrete Anfrage-Positionen (gleiche Form wie Angebotspositionen, Freitext erlaubt).
        lines: z.array(z.object({
          description: z.string(),
          qty: z.number().int().positive(),
          unitNetCents: z.number().int().nonnegative(),
          taxRatePct: z.number().optional(),
          kind: z.enum(["TEXTIL", "VEREDELUNG", "SONSTIGE"]),
          variantId: z.string().nullable().optional(),
          bezugPosition: z.number().int().nullable().optional(),
        })).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, expectedCloseAt, ...rest } = input;
        const patch = { ...rest, ...(expectedCloseAt !== undefined ? { expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : null } : {}) };
        try { return await ctx.crm.update(id, patch); } catch (e) { throw toTrpcError(e); }
      }),
    advance: roleProcedure(...supplierRoles)
      .input(z.object({
        id: z.string().min(1),
        to: z.enum(["KONTAKTIERT", "QUALIFIZIERT", "ANGEBOT", "GEWONNEN", "VERLOREN"]),
        lostReason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.crm.advance(input.id, input.to, input.lostReason); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
    convertToQuote: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.crm.convertToQuote(input.id); } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Leads/Interessenten (B15): Funnel NEU->KONTAKTIERT->QUALIFIZIERT->konvertiert.
  leads: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.leads.list()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({
        name: z.string().min(1),
        quelle: z.enum(["WEB", "EMAIL", "SHOP", "TELEFON"]),
        firma: z.string().optional(),
        webseite: z.string().optional(),
        verantwortlicher: z.string().optional(),
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

  // Telefon-Modul / Anrufprotokoll: wer/wann/weswegen telefoniert hat, mit Rückruf-Status.
  callLogs: router({
    list: roleProcedure(...supplierRoles)
      .input(z.object({
        companyId: z.string().optional(),
        status: z.enum(["ERLEDIGT", "OFFEN", "RUECKRUF"]).optional(),
      }).optional())
      .query(({ input, ctx }) => ctx.callLogs.list(input)),
    openCallbackCount: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.callLogs.openCallbackCount()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({
        richtung: z.enum(["EINGEHEND", "AUSGEHEND"]),
        telefonnummer: z.string().min(1),
        grund: z.string().min(1),
        kontaktName: z.string().optional(),
        companyId: z.string().optional(),
        bearbeiter: z.string().optional(),
        zeitpunkt: z.coerce.date().optional(),
        dauerSek: z.number().int().nonnegative().optional(),
        ergebnis: z.string().optional(),
        status: z.enum(["ERLEDIGT", "OFFEN", "RUECKRUF"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.callLogs.create({ ...input, bearbeiter: input.bearbeiter ?? ctx.user?.email ?? null }); } catch (e) { throw toTrpcError(e); }
      }),
    setStatus: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1), status: z.enum(["ERLEDIGT", "OFFEN", "RUECKRUF"]) }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.callLogs.setStatus(input.id, input.status); } catch (e) { throw toTrpcError(e); }
      }),
    update: roleProcedure(...supplierRoles)
      .input(z.object({
        id: z.string().min(1),
        richtung: z.enum(["EINGEHEND", "AUSGEHEND"]).optional(),
        telefonnummer: z.string().min(1).optional(),
        grund: z.string().min(1).optional(),
        kontaktName: z.string().nullable().optional(),
        companyId: z.string().nullable().optional(),
        zeitpunkt: z.coerce.date().optional(),
        dauerSek: z.number().int().nonnegative().nullable().optional(),
        ergebnis: z.string().nullable().optional(),
        status: z.enum(["ERLEDIGT", "OFFEN", "RUECKRUF"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...patch } = input;
        try { await ctx.callLogs.update(id, patch); return { ok: true as const }; } catch (e) { throw toTrpcError(e); }
      }),
  }),

  // Multi-Mailkonten (IONOS): mehrere Konten, je eines Standard ein-/ausgehend, Passwort
  // verschlüsselt. Nur ADMIN (sensible Zugangsdaten); Passwort nie ausgeliefert.
  mailAccounts: router({
    list: roleProcedure("ADMIN").query(({ ctx }) => ctx.mailAccounts.list()),
    create: roleProcedure("ADMIN")
      .input(z.object({
        name: z.string().min(1),
        emailAddress: z.string().email(),
        imapHost: z.string().optional(),
        imapPort: z.number().int().positive().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().int().positive().optional(),
        username: z.string().nullable().optional(),
        password: z.string().nullable().optional(),
        enableIncoming: z.boolean().optional(),
        enableOutgoing: z.boolean().optional(),
        defaultIncoming: z.boolean().optional(),
        defaultOutgoing: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => { try { return await ctx.mailAccounts.create(input); } catch (e) { throw toTrpcError(e); } }),
    update: roleProcedure("ADMIN")
      .input(z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        emailAddress: z.string().email().optional(),
        imapHost: z.string().optional(),
        imapPort: z.number().int().positive().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().int().positive().optional(),
        username: z.string().nullable().optional(),
        password: z.string().nullable().optional(),
        enableIncoming: z.boolean().optional(),
        enableOutgoing: z.boolean().optional(),
        defaultIncoming: z.boolean().optional(),
        defaultOutgoing: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => { const { id, ...patch } = input; try { return await ctx.mailAccounts.update(id, patch as Parameters<typeof ctx.mailAccounts.update>[1]); } catch (e) { throw toTrpcError(e); } }),
    setDefault: roleProcedure("ADMIN")
      .input(z.object({ id: z.string().min(1), kind: z.enum(["incoming", "outgoing"]) }))
      .mutation(async ({ input, ctx }) => { try { await ctx.mailAccounts.setDefault(input.id, input.kind); return { ok: true as const }; } catch (e) { throw toTrpcError(e); } }),
    remove: roleProcedure("ADMIN")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { try { await ctx.mailAccounts.remove(input.id); return { ok: true as const }; } catch (e) { throw toTrpcError(e); } }),
  }),

  // Kostenstellen (B7): Stammdaten anlegen/auflisten/löschen + Auswertung je Kostenstelle.
  costCenters: router({
    list: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.costCenters.list()),
    report: roleProcedure(...supplierRoles).query(({ ctx }) => ctx.costCenters.invoiceReport()),
    create: roleProcedure(...supplierRoles)
      .input(z.object({ nummer: z.string().min(1), name: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.costCenters.create(input.nummer, input.name)),
    update: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1), nummer: z.string().min(1), name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { try { await ctx.costCenters.update(input.id, input.nummer, input.name); return { ok: true as const }; } catch (e) { throw toTrpcError(e); } }),
    delete: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => ctx.costCenters.remove(input.id)),
  }),

  // Aufgaben/Zuweisung (Assigned To/ToDo): persönliche Arbeitsliste.
  tasks: router({
    /** Meine offenen Aufgaben (Arbeitsliste). */
    mine: protectedProcedure
      .input(z.object({ includeDone: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => ctx.tasks.listForUser(ctx.user.email, input?.includeDone ?? false)),

    /** Von mir angelegte/delegierte Aufgaben — damit der Ersteller zugewiesene weiter sieht. */
    assignedByMe: protectedProcedure
      .input(z.object({ includeDone: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => ctx.tasks.listAssignedBy(ctx.user.id, input?.includeDone ?? false)),

    /** Zuweisbare Mitarbeiter (aktive Benutzer) für das Empfänger-Dropdown. */
    assignees: protectedProcedure.query(async ({ ctx }) =>
      (await ctx.auth.listUsers()).filter((u) => u.active).map((u) => ({ email: u.email, name: u.name }))),

    /** Zähler für das Badge im Header. */
    openCount: protectedProcedure.query(({ ctx }) => ctx.tasks.openCount(ctx.user.email)),

    /** Aufgaben eines Belegs. */
    forEntity: roleProcedure(...allRoles)
      .input(z.object({ entity: z.string().min(1), entityId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.tasks.listForEntity(input.entity, input.entityId)),

    create: roleProcedure(...allRoles)
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        assigneeEmail: z.string().email(),
        entity: z.string().optional(),
        entityId: z.string().optional(),
        navKey: z.string().optional(),
        dueDate: z.string().datetime().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const res = await ctx.tasks.create({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : null, createdBy: ctx.user.id });
          await syncTaskCalendar(ctx, res.id); // Fälligkeit → Kalendereintrag beim Zuständigen
          return res;
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { await ctx.tasks.complete(input.id, ctx.user.id); await syncTaskCalendar(ctx, input.id); return { ok: true as const }; }),

    reopen: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { await ctx.tasks.reopen(input.id, ctx.user.id); await syncTaskCalendar(ctx, input.id); return { ok: true as const }; }),

    reassign: roleProcedure(...allRoles)
      .input(z.object({ id: z.string().min(1), assigneeEmail: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.tasks.reassign(input.id, input.assigneeEmail, ctx.user.id); await syncTaskCalendar(ctx, input.id); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    update: roleProcedure(...allRoles)
      .input(z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        navKey: z.string().nullable().optional(),
        // Umverteilung auch über update — wird echt verarbeitet (kein stiller {ok:true}).
        assigneeEmail: z.string().email().optional(),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        const { id, dueDate, assigneeEmail, ...rest } = input;
        const patch = { ...rest, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) };
        try {
          await ctx.tasks.update(id, patch, ctx.user.id);
          if (assigneeEmail) await ctx.tasks.reassign(id, assigneeEmail, ctx.user.id);
          await syncTaskCalendar(ctx, id); // Fälligkeit/Empfänger → Kalender nachziehen
          return { ok: true as const };
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Persönliche UI-Einstellungen je Nutzer (z. B. Home-Workspace-Layout, geräteübergreifend).
  preferences: router({
    get: protectedProcedure
      .input(z.object({ key: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.preferences.get(ctx.user.id, input.key)),
    set: protectedProcedure
      .input(z.object({ key: z.string().min(1), value: z.unknown() }))
      .mutation(async ({ input, ctx }) => { await ctx.preferences.set(ctx.user.id, input.key, input.value); return { ok: true as const }; }),
  }),

  // Audit-Log-Viewer (GoBD, Kap. 10): „wer hat wann was geändert". Nur Admin (before/after
  // können Preis-/Kundendaten enthalten → kein Zugriff für andere Rollen).
  auditLog: router({
    entities: roleProcedure("ADMIN").query(({ ctx }) => ctx.auditLog.entities()),
    list: roleProcedure("ADMIN")
      .input(z.object({
        entity: z.string().optional(),
        entityId: z.string().optional(),
        action: z.string().optional(),
        userEmail: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().positive().optional(),
      }).optional())
      .query(({ input, ctx }) => ctx.auditLog.list({
        ...input,
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
      })),
  }),

  // EAN-Listen-Import (B18): Massenimport Artikelstammdaten mit automatischem EAN/SKU-Abgleich.
  // Stammdaten/Preise → kein PRODUKTION-Zugriff (Kap. 12). Vorschau (read-only) + Anwenden.
  eanImport: router({
    preview: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ csv: z.string() }))
      .mutation(({ input, ctx }) => ctx.eanImport.preview(input.csv)),
    run: roleProcedure("ADMIN", "BUERO")
      .input(z.object({
        csv: z.string(),
        options: z.object({
          createUnmatched: z.boolean(),
          updatePim: z.boolean(),
          updateGtinWeight: z.boolean(),
          ek: z.object({ supplierId: z.string().min(1) }).optional(),
          vk: z.object({
            groups: z.array(z.object({
              kind: z.enum(["STANDARD", "TOP", "PREMIUM", "WIEDERVERKAEUFER", "AGENTUR"]),
              factor: z.number().positive(),
            })).min(1),
          }).optional(),
        }),
      }))
      .mutation(({ input, ctx }) => ctx.eanImport.apply(input.csv, input.options)),
  }),

  // Finanz-Reporting (B19, Kap. 29): OP-Aging + DSO. Finanzdaten → kein PRODUKTION-Zugriff.
  financeReport: router({
    aging: roleProcedure(...supplierRoles)
      .input(z.object({ asOf: z.string().datetime().optional() }).optional())
      .query(({ input, ctx }) => ctx.financeReport.agingReport(input?.asOf ? new Date(input.asOf) : new Date())),
    agingWithDso: roleProcedure(...supplierRoles)
      .input(z.object({ from: z.string().datetime(), asOf: z.string().datetime().optional() }))
      .query(({ input, ctx }) => ctx.financeReport.agingWithDso(new Date(input.from), input.asOf ? new Date(input.asOf) : new Date())),
  }),

  // Regel-Engine (Event → Bedingung → Aktion). Konfiguration nur Admin.
  automation: router({
    meta: roleProcedure("ADMIN").query(({ ctx }) => ({ triggers: ctx.automation.knownTriggers(), actions: ctx.automation.knownActions() })),
    list: roleProcedure("ADMIN").query(({ ctx }) => ctx.automation.list()),
    create: roleProcedure("ADMIN")
      .input(z.object({
        name: z.string().min(1),
        triggerEvent: z.string().min(1),
        conditions: z.array(z.object({ field: z.string().min(1), op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"]), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]) })),
        actions: z.array(z.object({ type: z.string().min(1), params: z.record(z.string()) })),
      }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.automation.create(input); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    setActive: roleProcedure("ADMIN")
      .input(z.object({ id: z.string().min(1), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => { await ctx.automation.setActive(input.id, input.active); return { ok: true as const }; }),
    remove: roleProcedure("ADMIN")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { await ctx.automation.remove(input.id); return { ok: true as const }; }),
  }),

  // Contact-Dynamic-Link (CRM): Person ↔ mehrere Parteien.
  contacts: router({
    /** Personen einer Partei (Stammkontakte + zusätzliche Dynamic-Links). */
    forEntity: roleProcedure(...supplierRoles)
      .input(z.object({ entity: z.enum(["Company", "Lead", "Supplier"]), entityId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.contactLinks.contactsForEntity(input.entity, input.entityId)),

    /** Alle Parteien, mit denen eine Person verknüpft ist. */
    links: roleProcedure(...supplierRoles)
      .input(z.object({ contactId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.contactLinks.linksForContact(input.contactId)),

    link: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ contactId: z.string().min(1), entity: z.enum(["Company", "Lead", "Supplier"]), entityId: z.string().min(1), role: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.contactLinks.link(input.contactId, input.entity, input.entityId, input.role); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    unlink: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => { await ctx.contactLinks.unlink(input.id); return { ok: true as const }; }),

    /** Person direkt in der Kundenmaske anlegen (Stammkontakt der Firma). */
    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ companyId: z.string().min(1), firstName: z.string(), lastName: z.string(), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await ctx.contactLinks.createForCompany(input.companyId, input); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    /** Stammdaten einer Person bearbeiten (nur gesetzte Felder, null = leeren). */
    update: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().nullable().optional(), phone: z.string().nullable().optional(), role: z.string().nullable().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...fields } = input;
        try { await ctx.contactLinks.updateContact(id, fields); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    /** Eigenen Stammkontakt löschen (Fremde nur entkoppeln). */
    delete: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), companyId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.contactLinks.deleteContactForCompany(input.id, input.companyId); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Lieferadressen je Firma (B3 / Xentral-Benchmark): mehrere benannte Adressen + Standard.
  addresses: router({
    forCompany: roleProcedure(...supplierRoles)
      .input(z.object({ companyId: z.string().min(1) }))
      .query(({ input, ctx }) => ctx.companyAddresses.list(input.companyId)),

    create: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ companyId: z.string().min(1), label: z.string(), street: z.string(), zip: z.string(), city: z.string(), country: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { companyId, ...fields } = input;
        try { return await ctx.companyAddresses.create(companyId, fields); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    update: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), companyId: z.string().min(1), label: z.string().optional(), street: z.string().optional(), zip: z.string().optional(), city: z.string().optional(), country: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { id, companyId, ...fields } = input;
        try { await ctx.companyAddresses.update(id, companyId, fields); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    setDefault: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), companyId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.companyAddresses.setDefault(input.companyId, input.id); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    delete: roleProcedure("ADMIN", "BUERO")
      .input(z.object({ id: z.string().min(1), companyId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try { await ctx.companyAddresses.delete(input.id, input.companyId); return { ok: true as const }; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // Order → Invoice „Make-Target" (Kap. 9.1): Auftrag fakturieren (ERPNext-Muster).
  invoices: router({
    list: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(200) }).optional())
      .query(({ input, ctx }) => ctx.invoices.listRecent(input?.limit ?? 50)),

    /** Auftrag → Rechnung: Positionsübernahme + USt, OP anlegen, fakturastatus zurückmelden. */
    createFromOrder: roleProcedure("ADMIN", "BUERO", "BUCHHALTUNG")
      .input(z.object({ orderId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const res = await ctx.invoices.createFromOrder(input.orderId);
          // GoBD: Rechnung sofort unveränderbar archivieren (WORM), nicht umgehbar.
          await autoArchive(ctx, "RECHNUNG", "Invoice", res.id, () => ctx.print.invoicePdf(res.id));
          return res;
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    /** Storno per Gutschrift (WORM): neutralisiert die Rechnung, ohne sie zu verändern. */
    cancelByCreditNote: roleProcedure("ADMIN", "BUCHHALTUNG")
      .input(z.object({ invoiceId: z.string().min(1), reason: z.string().min(1), restock: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const res = await ctx.invoices.cancelByCreditNote(input.invoiceId, input.reason, input.restock ?? false);
          // GoBD: Gutschrift/Storno-Beleg unveränderbar archivieren (WORM).
          await autoArchive(ctx, "GUTSCHRIFT", "CreditNote", res.id, () => ctx.print.creditNotePdf(res.id));
          return res;
        }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
  }),

  // GoBD-Belegarchiv (Kap. 10): WORM-Ablage + Z3-Export. Finanzrelevant → kein PRODUKTION.
  archive: router({
    list: roleProcedure(...supplierRoles)
      .input(z.object({ limit: z.number().int().positive().max(500) }).optional())
      .query(({ input, ctx }) => ctx.archive.list(input?.limit ?? 50)),

    /**
     * Backfill (P1): zieht alle bereits finalisierten Belege idempotent ins WORM-Archiv nach
     * (Rechnungen, versendete/entschiedene Angebote, Lieferscheine). PDFs werden aus den
     * vorhandenen Generatoren erzeugt; SHA-256-Dedupe verhindert Dubletten. GoBD-Erstbefüllung.
     */
    backfill: roleProcedure("ADMIN", "BUCHHALTUNG").mutation(async ({ ctx }) => {
      let invoices = 0, quotes = 0, deliveryNotes = 0;
      for (const i of await ctx.invoices.listRecent(500)) {
        if (await autoArchive(ctx, "RECHNUNG", "Invoice", i.id, () => ctx.print.invoicePdf(i.id))) invoices++;
      }
      const DECIDED = new Set(["VERSENDET", "NACHFASSEN", "ANGENOMMEN", "ABGELEHNT"]);
      for (const q of await ctx.quotes.list()) {
        if (DECIDED.has(q.status) && await autoArchive(ctx, "ANGEBOT", "Quote", q.id, () => ctx.print.quotePdf(q.id))) quotes++;
      }
      for (const o of await ctx.orders.listRecent(500)) {
        for (const dn of await ctx.deliveries.listDeliveryNotes(String(o.id))) {
          if (await autoArchive(ctx, "LIEFERSCHEIN", "DeliveryNote", dn.id, () => ctx.print.deliveryNotePdf(dn.id))) deliveryNotes++;
        }
      }
      return { invoices, quotes, deliveryNotes, total: invoices + quotes + deliveryNotes };
    }),

    /**
     * Vollständigkeits-Report (P2): finalisierte Belege ohne Archiveintrag. Nach Auto-
     * Archivierung + Backfill sollte `missing` leer sein (Compliance-Kachel).
     */
    missing: roleProcedure("ADMIN", "BUCHHALTUNG").query(async ({ ctx }) => {
      const expected: { type: string; sourceEntity: string; sourceId: string; label: string }[] = [];
      for (const i of await ctx.invoices.listRecent(500)) expected.push({ type: "RECHNUNG", sourceEntity: "Invoice", sourceId: i.id, label: i.number });
      const DECIDED = new Set(["VERSENDET", "NACHFASSEN", "ANGENOMMEN", "ABGELEHNT"]);
      for (const q of await ctx.quotes.list()) if (DECIDED.has(q.status)) expected.push({ type: "ANGEBOT", sourceEntity: "Quote", sourceId: q.id, label: q.number });
      for (const o of await ctx.orders.listRecent(500)) for (const dn of await ctx.deliveries.listDeliveryNotes(String(o.id))) expected.push({ type: "LIEFERSCHEIN", sourceEntity: "DeliveryNote", sourceId: dn.id, label: dn.number });
      const missing = await ctx.archive.missingFrom(expected);
      return { expectedCount: expected.length, missingCount: missing.length, missing };
    }),

    /** Beleg unveränderbar archivieren (Datei base64-kodiert). */
    archive: roleProcedure(...supplierRoles)
      .input(z.object({
        belegart: z.enum(["RECHNUNG", "GUTSCHRIFT", "EINGANGSRECHNUNG", "BUCHUNGSBELEG", "LIEFERSCHEIN", "AUFTRAGSBESTAETIGUNG", "ANGEBOT", "MAHNUNG", "GESCHAEFTSBRIEF", "LOGO", "SONSTIGES"]),
        sourceEntity: z.string().min(1),
        sourceId: z.string().min(1),
        fileName: z.string().min(1),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await ctx.archive.archive({
            belegart: input.belegart,
            sourceEntity: input.sourceEntity,
            sourceId: input.sourceId,
            fileName: input.fileName,
            contentType: input.contentType,
            data: new Uint8Array(Buffer.from(input.dataBase64, "base64")),
            userId: ctx.user.id,
          });
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    /** Beleg samt Bytes (base64) lesen — Hash wird beim Lesen geprüft. */
    get: roleProcedure(...supplierRoles)
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const res = await ctx.archive.retrieve(input.id);
        if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Beleg nicht gefunden." });
        return { meta: res.meta, dataBase64: Buffer.from(res.data).toString("base64") };
      }),

    /** Legal Hold setzen/aufheben (nur Geschäftsleitung). */
    setLegalHold: roleProcedure("ADMIN", "BUCHHALTUNG")
      .input(z.object({ id: z.string().min(1), hold: z.boolean() }))
      .mutation(async ({ input, ctx }) => { await ctx.archive.setLegalHold(input.id, input.hold, ctx.user.id); return { ok: true as const }; }),

    /** GoBD/GDPdU-„Z3"-Export (index.xml + manifest.csv) über einen Zeitraum. */
    gobdExport: roleProcedure("ADMIN", "BUCHHALTUNG")
      .input(z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).optional())
      .query(({ input, ctx }) => ctx.archive.buildGobdExport({
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
      })),
  }),
});

export type AppRouter = typeof appRouter;
