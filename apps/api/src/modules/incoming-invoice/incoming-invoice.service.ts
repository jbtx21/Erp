// Anwendungsfall: Eingangsrechnungen (Kreditoren) — GetMyInvoices-Vorbild (Kap. 9.4/9.6/19).
// Ein zentraler Beleg-Eingang über E-/X-Rechnung (strukturiert) ODER OCR-Texterkennung (PDF/
// Scan): Lieferant auflösen, Positionen + Zahlungskonditionen (Fälligkeit/Skonto) erfassen,
// EK gegen die Artikelstammdaten abgleichen, nach dem Abgleich zur Zahlung freigeben und bis
// Zahlungsziel/Skonto bezahlen. Ungültige Belege / unbekannte Lieferanten gehen in die Klärung
// (kein Phantom-Lieferant). Idempotent über (supplierId, number). Repository als Interface.

import {
  computePaymentSchedule,
  parseInvoiceText,
  receiveEInvoice,
  reconcileEk,
  type EkInvoiceLine,
  type EkOverall,
  type ExtractedInvoice,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export type IncomingInvoiceSource = "E_RECHNUNG" | "OCR" | "MANUAL";
export type EkCheckStatus = "OFFEN" | "OK" | "ABWEICHUNG" | "PRUEFUNG";
export type IncomingInvoiceStatus = "ERFASST" | "GEPRUEFT" | "GESPERRT" | "FREIGEGEBEN" | "BEZAHLT";

/** Position einer zu erfassenden Eingangsrechnung (variantId aufgelöst über supplierSku). */
export interface IncomingInvoiceLineInput {
  position: number;
  description: string;
  supplierSku: string | null;
  variantId: string | null;
  qty: number;
  unitEkCents: number;
  lineNetCents: number;
}

export interface CreateIncomingInvoiceInput {
  supplierId: string;
  number: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  issueDate: Date;
  purchaseOrderId?: string | null;
  status?: IncomingInvoiceStatus;
  source: IncomingInvoiceSource;
  eInvoiceXml?: string | null;
  dueDate: Date;
  skontoPercent: number | null;
  skontoDays: number | null;
  skontoUntil: Date | null;
  lines: IncomingInvoiceLineInput[];
}

/** Konditionen-Snapshot des Lieferanten (für Fälligkeit/Skonto). */
export interface SupplierTerms {
  zahlungszielTage: number;
  skontoPercent: number | null;
  skontoDays: number | null;
}

/** Eine Rechnungsposition mit Stamm-EK (für den EK-Abgleich). */
export interface EkCheckLine {
  ref: string;
  variantId: string | null;
  qty: number;
  unitEkCents: number;
  masterEkCents: number | null;
}

export interface IncomingInvoiceDetail {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  status: IncomingInvoiceStatus;
  ekCheckStatus: EkCheckStatus;
  source: IncomingInvoiceSource;
  netCents: number;
  taxCents: number;
  grossCents: number;
  issueDate: Date | null;
  dueDate: Date | null;
  skontoPercent: number | null;
  skontoDays: number | null;
  skontoUntil: Date | null;
  paidAt: Date | null;
  paymentAmountCents: number | null;
  freigegebenVon: string | null;
  lines: EkCheckLine[];
}

export interface IncomingInvoiceRepository {
  /** Löst den Lieferanten über USt-IdNr. (bevorzugt), sonst exakten Namen auf. */
  findSupplierByVatIdOrName(vatId: string | undefined, name: string): Promise<string | null>;
  findBySupplierAndNumber(supplierId: string, number: string): Promise<{ id: string } | null>;
  createIncomingInvoice(input: CreateIncomingInvoiceInput): Promise<{ id: string }>;
  /** Genau eine offene Bestellung des Lieferanten (für Auto-Match); null bei 0 oder >1. */
  findSoleOpenPoForSupplier(supplierId: string): Promise<{ id: string; expectedNetCents: number } | null>;
  /** Konditionen des Lieferanten (Zahlungsziel/Skonto); null = unbekannt. */
  supplierTerms(supplierId: string): Promise<SupplierTerms | null>;
  /** supplierSku → interne variantId (über SupplierItem.supplierSku des Lieferanten). */
  resolveVariantBySupplierSku(supplierId: string, skus: string[]): Promise<Map<string, string>>;
  /** Detail einer Eingangsrechnung inkl. Positionen + Stamm-EK je Variante; null = unbekannt. */
  detail(invoiceId: string): Promise<IncomingInvoiceDetail | null>;
  /** Persistiert das EK-Abgleich-Ergebnis. */
  setEkCheckStatus(invoiceId: string, status: EkCheckStatus): Promise<void>;
  /** Setzt den Beleg auf FREIGEGEBEN (nach EK-Abgleich). */
  setFreigegeben(invoiceId: string, user: string): Promise<void>;
  /** Bucht die Zahlung: Status BEZAHLT + gezahlter Betrag + Datum. */
  setPaid(invoiceId: string, amountCents: number, paidAt: Date): Promise<void>;
}

export type ClarificationReason = "VALIDIERUNG" | "LIEFERANT_UNBEKANNT" | "ERKENNUNG";

export type ReceiveResult =
  | { status: "ERFASST" | "GEPRUEFT" | "GESPERRT"; incomingInvoiceId: string; supplierId: string; number: string; created: boolean; matched: boolean }
  | { status: "KLAERUNG"; reason: ClarificationReason; details: string[] };

// Auto-Match-Toleranz (Kap. 9.6): 2 % Nettoabweichung als Grundband. LOW_FLOOR = 5 ct
// gegen Cent-Rundungsrauschen bei Kleinstbestellungen. CAP = 50.000 ct (500 €) deckelt die
// absolute Bandbreite; darüber geht die Rechnung in die manuelle Prüfung (GESPERRT).
const AUTO_MATCH_NET_TOLERANCE_PCT = 0.02;
const AUTO_MATCH_LOW_FLOOR_CENTS = 5;
const AUTO_MATCH_CAP_CENTS = 50_000;

export class IncomingInvoiceError extends Error {}

export class IncomingInvoiceService {
  constructor(
    private readonly repo: IncomingInvoiceRepository,
    private readonly audit: AuditSink
  ) {}

  /** Empfängt eine E-/X-Rechnung (CII-XML): validieren → Lieferant auflösen → erfassen/klären. */
  async receive(xml: string): Promise<ReceiveResult> {
    const result = receiveEInvoice(xml);
    if (!result.draft) return { status: "KLAERUNG", reason: "VALIDIERUNG", details: result.validation.errors };
    return this.ingest({
      supplierName: result.draft.supplierName,
      ...(result.draft.supplierVatId ? { supplierVatId: result.draft.supplierVatId } : {}),
      number: result.draft.number,
      issueDate: result.draft.issueDate,
      netCents: result.draft.netCents,
      taxCents: result.draft.taxCents,
      grossCents: result.draft.grossCents,
      lines: result.draft.lines,
    }, "E_RECHNUNG", xml);
  }

  /** Erfasst eine per OCR/Texterkennung ausgelesene Rechnung (PDF/Scan → kanonische Form). */
  async receiveOcrText(text: string): Promise<ReceiveResult> {
    const extracted = parseInvoiceText(text);
    if (!extracted) return { status: "KLAERUNG", reason: "ERKENNUNG", details: ["Pflichtfelder (Lieferant, Nummer, Datum, Betrag) nicht erkannt."] };
    return this.ingest(extracted, "OCR", null);
  }

  /** Gemeinsamer Erfassungspfad für E-Rechnung + OCR: Lieferant + Konditionen + Positionen + 3-Way. */
  private async ingest(e: ExtractedInvoice, source: IncomingInvoiceSource, xml: string | null): Promise<ReceiveResult> {
    const supplierId = await this.repo.findSupplierByVatIdOrName(e.supplierVatId, e.supplierName);
    if (!supplierId) {
      return { status: "KLAERUNG", reason: "LIEFERANT_UNBEKANNT", details: [e.supplierVatId ? `${e.supplierName} (${e.supplierVatId})` : e.supplierName] };
    }

    const existing = await this.repo.findBySupplierAndNumber(supplierId, e.number);
    if (existing) return { status: "ERFASST", incomingInvoiceId: existing.id, supplierId, number: e.number, created: false, matched: false };

    // 3-Way-Match-Auto-Trigger (Kap. 9.6): genau eine offene PO → Betragsabgleich (Netto).
    const po = await this.repo.findSoleOpenPoForSupplier(supplierId);
    let status: "ERFASST" | "GEPRUEFT" | "GESPERRT" = "ERFASST";
    let purchaseOrderId: string | null = null;
    if (po) {
      purchaseOrderId = po.id;
      const tol = Math.min(Math.max(Math.round(po.expectedNetCents * AUTO_MATCH_NET_TOLERANCE_PCT), AUTO_MATCH_LOW_FLOOR_CENTS), AUTO_MATCH_CAP_CENTS);
      status = Math.abs(e.netCents - po.expectedNetCents) <= tol ? "GEPRUEFT" : "GESPERRT";
    }

    // Konditionen-Snapshot (Fälligkeit/Skonto) aus den Lieferantenstammdaten.
    const terms = (await this.repo.supplierTerms(supplierId)) ?? { zahlungszielTage: 14, skontoPercent: null, skontoDays: null };
    const schedule = computePaymentSchedule(e.issueDate, e.grossCents, terms);

    // Positionen auf interne Varianten auflösen (supplierSku → SupplierItem.supplierSku).
    const skus = e.lines.map((l) => l.supplierSku).filter((s): s is string => !!s);
    const skuMap = skus.length > 0 ? await this.repo.resolveVariantBySupplierSku(supplierId, skus) : new Map<string, string>();
    const lines: IncomingInvoiceLineInput[] = e.lines.map((l, i) => ({
      position: i + 1,
      description: l.description,
      supplierSku: l.supplierSku ?? null,
      variantId: l.supplierSku ? skuMap.get(l.supplierSku) ?? null : null,
      qty: l.qty,
      unitEkCents: l.unitNetCents,
      lineNetCents: l.qty * l.unitNetCents,
    }));

    const created = await this.repo.createIncomingInvoice({
      supplierId, number: e.number, netCents: e.netCents, taxCents: e.taxCents, grossCents: e.grossCents,
      issueDate: e.issueDate, purchaseOrderId, status, source, eInvoiceXml: xml,
      dueDate: schedule.dueDate, skontoPercent: schedule.skontoPercent || null, skontoDays: terms.skontoDays, skontoUntil: schedule.skontoUntil,
      lines,
    });

    await this.audit.append(buildEntry({
      entity: "IncomingInvoice", entityId: created.id, action: "CREATE",
      after: { source, supplierId, number: e.number, grossCents: e.grossCents, purchaseOrderId, status, lineCount: lines.length, autoMatched: po !== null },
    }));

    return { status, incomingInvoiceId: created.id, supplierId, number: e.number, created: true, matched: po !== null };
  }

  /** Beleg-Detail inkl. Positionen + Stamm-EK (für die UI / den EK-Abgleich). */
  async detail(invoiceId: string): Promise<IncomingInvoiceDetail> {
    const d = await this.repo.detail(invoiceId);
    if (!d) throw new IncomingInvoiceError("Eingangsrechnung nicht gefunden.");
    return d;
  }

  /**
   * EK-Abgleich (Kap. 6/9.6): berechneter EK je Position ↔ Stamm-EK (SupplierItem.ekCents).
   * Persistiert das Ergebnis (OK/ABWEICHUNG/PRUEFUNG) und liefert die Positionsbewertung zurück.
   */
  async runEkCheck(invoiceId: string): Promise<{ overall: EkOverall; result: ReturnType<typeof reconcileEk> }> {
    const d = await this.repo.detail(invoiceId);
    if (!d) throw new IncomingInvoiceError("Eingangsrechnung nicht gefunden.");

    const lines: EkInvoiceLine[] = d.lines.map((l) => ({ ref: l.ref, variantId: l.variantId, qty: l.qty, invoiceUnitEkCents: l.unitEkCents }));
    const master = new Map<string, number>();
    for (const l of d.lines) if (l.variantId && l.masterEkCents != null) master.set(l.variantId, l.masterEkCents);

    const result = reconcileEk(lines, master);
    await this.repo.setEkCheckStatus(invoiceId, result.overall);
    await this.audit.append(buildEntry({ entity: "IncomingInvoice", entityId: invoiceId, action: "UPDATE", after: { ekCheckStatus: result.overall, maxAbsDiffPercent: result.maxAbsDiffPercent } }));
    return { overall: result.overall, result };
  }

  /**
   * Gibt die Rechnung nach dem EK-Abgleich zur Zahlung frei (GetMyInvoices: prüfen → freigeben).
   * OK/PRUEFUNG dürfen freigegeben werden; ABWEICHUNG nur durch die Geschäftsleitung (ADMIN-
   * Override), sonst Sperre. Nicht durchgeführter EK-Abgleich (OFFEN) blockiert ebenfalls.
   */
  async freigeben(invoiceId: string, user: string, opts: { role?: string } = {}): Promise<{ status: IncomingInvoiceStatus }> {
    const d = await this.repo.detail(invoiceId);
    if (!d) throw new IncomingInvoiceError("Eingangsrechnung nicht gefunden.");
    if (d.status === "BEZAHLT") throw new IncomingInvoiceError("Rechnung ist bereits bezahlt.");
    if (d.status === "FREIGEGEBEN") return { status: "FREIGEGEBEN" };
    if (d.ekCheckStatus === "OFFEN") throw new IncomingInvoiceError("Bitte zuerst den EK-Abgleich durchführen.");
    if (d.ekCheckStatus === "ABWEICHUNG" && opts.role !== "ADMIN") {
      throw new IncomingInvoiceError("EK-Abweichung: Freigabe nur durch die Geschäftsleitung.");
    }
    await this.repo.setFreigegeben(invoiceId, user);
    await this.audit.append(buildEntry({ entity: "IncomingInvoice", entityId: invoiceId, action: "UPDATE", after: { status: "FREIGEGEBEN", freigegebenVon: user, ekCheckStatus: d.ekCheckStatus } }));
    return { status: "FREIGEGEBEN" };
  }

  /**
   * Bezahlt eine freigegebene Rechnung „direkt aus dem Tool" (GetMyInvoices) und ordnet die
   * Zahlung dem Beleg zu: innerhalb der Skontofrist mit Abzug, sonst voller Betrag. Nur
   * FREIGEGEBENE Rechnungen sind zahlbar (Freigabe-Gate).
   */
  async markPaid(invoiceId: string, opts: { asOf?: Date } = {}): Promise<{ status: "BEZAHLT"; amountCents: number; withSkonto: boolean; payDate: Date }> {
    const d = await this.repo.detail(invoiceId);
    if (!d) throw new IncomingInvoiceError("Eingangsrechnung nicht gefunden.");
    if (d.status === "BEZAHLT") throw new IncomingInvoiceError("Rechnung ist bereits bezahlt.");
    if (d.status !== "FREIGEGEBEN") throw new IncomingInvoiceError("Nur freigegebene Rechnungen sind zahlbar (bitte zuerst freigeben).");
    const asOf = opts.asOf ?? new Date();
    // Zahlbetrag/-datum aus dem Konditions-Snapshot: innerhalb der Skontofrist mit Abzug, sonst voll.
    const withinSkonto = d.skontoUntil != null && !!d.skontoPercent && asOf.getTime() <= d.skontoUntil.getTime();
    const prop = withinSkonto
      ? { amountCents: d.grossCents - Math.round((d.grossCents * d.skontoPercent!) / 100), withSkonto: true, payDate: d.skontoUntil! }
      : { amountCents: d.grossCents, withSkonto: false, payDate: d.dueDate ?? asOf };
    await this.repo.setPaid(invoiceId, prop.amountCents, asOf);
    await this.audit.append(buildEntry({ entity: "IncomingInvoice", entityId: invoiceId, action: "UPDATE", after: { status: "BEZAHLT", amountCents: prop.amountCents, withSkonto: prop.withSkonto, paidAt: asOf.toISOString() } }));
    return { status: "BEZAHLT", amountCents: prop.amountCents, withSkonto: prop.withSkonto, payDate: prop.payDate };
  }
}
