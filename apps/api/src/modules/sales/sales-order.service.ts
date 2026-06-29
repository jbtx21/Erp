// Auftragserstellung (Vertrieb): manueller Auftrag und Angebot→Auftrag-Umwandlung.
// Vervollständigt die Belegkette Anfrage→Angebot→Auftrag (Innendienst legt direkt an).
// Shop-Import (T-01) bleibt der zweite Auftragsweg; hier die manuelle Erfassung.

import { buildEntry, type AuditSink } from "@texma/audit";
import type { PositionKind } from "@texma/shared";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface SalesLine {
  description: string;
  qty: number;
  unitNetCents: number; // effektiver Netto-Einzelpreis NACH Positionsrabatt
  listNetCents?: number | null; // VK-Listenpreis je Stück VOR Rabatt (Anzeige/Beleg)
  rabattPct?: number | null; // artikelbezogener Positionsrabatt in Prozent (0..100)
  taxRatePct?: number | null; // USt-Satz der Position (eingefroren); 0 = steuerbefreit. Default 19.
  kind?: PositionKind;
  variantId?: string;
  bezugPositionen?: number[]; // Veredelungsbezug: Positionsnummern der Textilpositionen (Kap. 5.4/11)
  dbCents?: number | null; // Deckungsbeitrag je Stück (VK − EK), Kap. 4.4
  lineType?: import("@texma/shared").LineType; // ARTIKEL | GRUPPE | ZWISCHENSUMME | GRUPPENSUMME
  placement?: string | null; positionType?: string | null; positionSide?: string | null; positionId?: string | null; motiv?: string | null; motivGroesse?: string | null; farbton?: string | null; platzierungsdetails?: string | null; sonstiges?: string | null; // Veredelungs-Detailfelder (Werkstattblatt-Karte) + Positions-Skizze (T-04)
  altPreisText?: string | null; // Alternativtext statt Euro-Betrag im PDF
  imPdfAusblenden?: boolean; // Position im Beleg-PDF ausblenden
  /**
   * Materialisierung: temporär (frei) erfasste Produktposition beim Wandeln in einen
   * festen Artikel überführen (Article+Variant anlegen, STANDARD-Preis = VK). Der Repo
   * legt den Artikel an und verknüpft die Auftragsposition mit der neuen Variante.
   */
  materializeArticle?: { sku: string; name: string; description?: string; isVeredelung: boolean };
}

export interface CreatedSalesOrder {
  id: string;
  number: string;
}

/**
 * Auflösung einer offenen Position beim Wandeln: entweder genau eine Variante (String) oder ein
 * Größenlauf — eine Liste {Variante, Stückzahl} aus der Varianten-Matrix (Farbe×Größe). Die
 * Stückzahlen gibt der Kunde nach der Muster-Anprobe je Größe durch.
 */
export type ConversionResolution = string | Array<{ variantId: string; qty: number }>;

/** Angebotsposition für die Auftragswandlung (mit Artikel-/Varianten-/Alternativ-Info). */
export interface ConversionPlanLine {
  position: number;
  description: string;
  qty: number;
  unitNetCents: number;
  listNetCents: number | null;
  rabattPct: number | null;
  taxRatePct: number; // USt-Satz aus dem Angebot (für die Auftragswandlung übernommen)
  kind: PositionKind;
  articleId: string | null;
  articleName: string | null;
  variantId: string | null;
  isAlternative: boolean;
  bezugPositionen: number[]; // Veredelungsbezug aus dem Angebot (Positionsnummern der Textilpositionen)
  dbCents: number | null; // Deckungsbeitrag je Stück (aus dem Angebot übernommen)
  lineType: import("@texma/shared").LineType;
  placement: string | null;
  positionType: string | null;
  positionSide: string | null;
  positionId: string | null;
  motiv: string | null;
  motivGroesse: string | null;
  farbton: string | null;
  platzierungsdetails: string | null;
  sonstiges: string | null;
  altPreisText: string | null;
  imPdfAusblenden: boolean;
  /** true, wenn ein Hauptartikel ohne Variante (Farbe×Größe muss gewählt werden). */
  needsVariant: boolean;
}

export interface ConversionPlan {
  companyId: string;
  existingOrderId: string | null;
  lines: ConversionPlanLine[];
}

/** Auftragsposition für die Bearbeitung (rekonstruiert die Erfassungsmaske). */
export interface OrderEditLine {
  description: string;
  qty: number;
  kind: PositionKind;
  unitNetCents: number;
  listNetCents: number | null;
  rabattPct: number | null;
  taxRatePct: number; // USt-Satz der Position (Round-Trip bei Bearbeitung)
  dbCents: number | null;
  variantId: string | null;
  bezugPositionen: number[]; // Veredelungsbezug (Positionsnummern der Textilpositionen)
  lineType: import("@texma/shared").LineType;
  placement: string | null;
  positionType: string | null;
  positionSide: string | null;
  positionId: string | null;
  motiv: string | null;
  motivGroesse: string | null;
  farbton: string | null;
  platzierungsdetails: string | null;
  sonstiges: string | null;
  altPreisText: string | null;
  imPdfAusblenden: boolean;
}

export interface OrderEditData {
  id: string;
  number: string;
  companyId: string;
  status: string;
  /** Sperrgründe gegen die Bearbeitung (leer = voll bearbeitbar). */
  invoiced: boolean;
  inProduction: boolean;
  delivered: boolean;
  lines: OrderEditLine[];
}

// Ab Versand/Fakturierung ist der Auftrag eingefroren — nur noch Storno (TEXMA-Regel,
// § 14 UStG / Belegkette). Bis dahin (auch in Produktion) voll bearbeitbar.
const FROZEN_ORDER_STATUS = new Set(["VERSENDET", "FAKTURIERT", "ABGESCHLOSSEN", "STORNIERT"]);
export function isOrderEditable(status: string): boolean {
  return !FROZEN_ORDER_STATUS.has(status);
}

export interface SalesOrderRepository {
  createOrder(input: { number: string; companyId: string; quoteId?: string; lines: SalesLine[] }): Promise<{ id: string }>;
  /** Angebotsdaten für die Umwandlung (inkl. Artikel-/Varianten-/Alternativ-Info); null wenn unbekannt. */
  conversionPlan(quoteId: string): Promise<ConversionPlan | null>;
  markQuoteAccepted(quoteId: string): Promise<void>;
  companyExists(companyId: string): Promise<boolean>;
  /** Auftrag mit Positionen + Sperrstatus für die Bearbeitung laden. */
  orderForEdit(orderId: string): Promise<OrderEditData | null>;
  /** Positionen (und Kunde) eines Auftrags ersetzen. */
  updateOrder(orderId: string, companyId: string, lines: SalesLine[]): Promise<void>;
}

export class SalesOrderError extends Error {}

function validateLines(lines: SalesLine[]): void {
  if (lines.length === 0) throw new SalesOrderError("Mindestens eine Position erforderlich.");
  for (const l of lines) {
    if (!l.description.trim()) throw new SalesOrderError("Jede Position braucht eine Beschreibung.");
    if (l.qty <= 0) throw new SalesOrderError("Menge muss größer als 0 sein.");
    if (l.unitNetCents < 0) throw new SalesOrderError("Preis darf nicht negativ sein.");
  }
}

export class SalesOrderService {
  constructor(
    private readonly repo: SalesOrderRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  /** Manueller Auftrag (ohne Angebot). */
  async createManual(companyId: string, lines: SalesLine[]): Promise<CreatedSalesOrder> {
    if (!companyId.trim()) throw new SalesOrderError("Firma ist Pflicht.");
    validateLines(lines);
    if (!(await this.repo.companyExists(companyId))) throw new SalesOrderError("Unbekannte Firma.");
    const number = await this.numbering.next("ORDER");
    const { id } = await this.repo.createOrder({ number, companyId, lines });
    await this.audit.append(buildEntry({ entity: "Order", entityId: id, action: "CREATE", after: { number, companyId, lineCount: lines.length, manual: true } }));
    return { id, number };
  }

  /** Angebotspositionen für die Umwandlung (Hauptartikel ohne Variante = needsVariant). */
  async conversionPlan(quoteId: string): Promise<ConversionPlan> {
    const plan = await this.repo.conversionPlan(quoteId);
    if (!plan) throw new SalesOrderError("Angebot nicht gefunden.");
    return plan;
  }

  /**
   * Angebot → Auftrag: übernimmt Positionen, verknüpft das Angebot, setzt es auf angenommen.
   * Alternativpositionen werden NICHT übernommen; für Hauptartikel ohne Variante muss die
   * gewählte Variante in `resolutions` (Position → variantId) mitgegeben werden. Eine offene
   * Textilposition kann als **Größenlauf** aufgelöst werden: statt einer Variante eine Liste
   * `[{ variantId, qty }]` (Farbe×Größe + Stückzahl je Größe), die der Kunde nach der
   * Muster-Anprobe durchgibt — die Position wird dann in mehrere Größenzeilen aufgeteilt.
   */
  async convertQuote(quoteId: string, resolutions: Record<number, ConversionResolution> = {}): Promise<CreatedSalesOrder> {
    const plan = await this.repo.conversionPlan(quoteId);
    if (!plan) throw new SalesOrderError("Angebot nicht gefunden.");
    if (plan.existingOrderId) throw new SalesOrderError("Angebot wurde bereits in einen Auftrag umgewandelt.");

    const number = await this.numbering.next("ORDER");
    // 1. Jede übernommene Position in eine oder mehrere Auftragszeilen expandieren (Größenlauf).
    const built: Array<{ originPos: number; line: SalesLine }> = [];
    for (const l of plan.lines.filter((x) => !x.isAlternative)) {
      const res = resolutions[l.position];
      // Größenlauf: Liste {variantId, qty} → je Eintrag eine Zeile; sonst eine Zeile mit der
      // einzelnen Variante (l.variantId ODER aufgelöste Variante) und der Positionsmenge.
      const entries = Array.isArray(res)
        ? res.filter((e) => e.qty > 0).map((e) => ({ variantId: e.variantId, qty: e.qty }))
        : [{ variantId: l.variantId ?? (typeof res === "string" ? res : undefined), qty: l.qty }];
      if (Array.isArray(res) && entries.length === 0) {
        throw new SalesOrderError(`Position ${l.position} „${l.articleName ?? l.description}": mindestens eine Größe mit Menge wählen.`);
      }
      entries.forEach((e, k) => {
        if (l.articleId && !e.variantId) {
          throw new SalesOrderError(`Position ${l.position} „${l.articleName ?? l.description}": Farbe & Größe wählen.`);
        }
        // Temporär (frei) erfasste Produktposition (TEXTIL/VEREDELUNG ohne Variante/Artikel)
        // → beim Wandeln immer als fester Artikel anlegen. SONSTIGE bleibt freie Position.
        const materialize = !e.variantId && !l.articleId && (l.kind === "TEXTIL" || l.kind === "VEREDELUNG");
        const skuSuffix = entries.length > 1 ? `-${k + 1}` : "";
        built.push({ originPos: l.position, line: {
          description: l.description, qty: e.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents, rabattPct: l.rabattPct, taxRatePct: l.taxRatePct, kind: l.kind, variantId: e.variantId, bezugPositionen: l.bezugPositionen, dbCents: l.dbCents,
          lineType: l.lineType, placement: l.placement, positionType: l.positionType, positionSide: l.positionSide, positionId: l.positionId, motiv: l.motiv, motivGroesse: l.motivGroesse, farbton: l.farbton, platzierungsdetails: l.platzierungsdetails, sonstiges: l.sonstiges, altPreisText: l.altPreisText, imPdfAusblenden: l.imPdfAusblenden,
          ...(materialize ? { materializeArticle: { sku: `${number}-P${l.position}${skuSuffix}`, name: l.description.trim(), description: l.description.trim(), isVeredelung: l.kind === "VEREDELUNG" } } : {}),
        } });
      });
    }
    // 2. Veredelungsbezug auf die NEUE Positionsnummerierung ummappen (Quote-Position → erste
    //    Auftragszeile dieser Position). Korrigiert auch den Versatz durch entfallene Alternativen.
    const firstNewPos = new Map<number, number>();
    built.forEach((b, i) => { if (!firstNewPos.has(b.originPos)) firstNewPos.set(b.originPos, i + 1); });
    const lines: SalesLine[] = built.map((b) => ({
      ...b.line,
      // Jede bezogene Quote-Position auf ihre erste neue Auftragsposition ummappen; entfallene
      // (z. B. nicht übernommene Alternativen) fallen still raus.
      bezugPositionen: (b.line.bezugPositionen ?? [])
        .map((p) => firstNewPos.get(p))
        .filter((p): p is number => p != null),
    }));
    validateLines(lines);
    const { id } = await this.repo.createOrder({ number, companyId: plan.companyId, quoteId, lines });
    await this.repo.markQuoteAccepted(quoteId);
    await this.audit.append(buildEntry({
      entity: "Order", entityId: id, action: "CREATE",
      after: { number, fromQuote: quoteId, lineCount: lines.length, droppedAlternatives: plan.lines.filter((l) => l.isAlternative).length, materialisierteArtikel: lines.filter((l) => l.materializeArticle).length },
    }));
    return { id, number };
  }

  /** Auftrag für die Bearbeitung laden (Positionen + Sperrstatus). */
  async getOrderForEdit(orderId: string): Promise<OrderEditData> {
    const data = await this.repo.orderForEdit(orderId);
    if (!data) throw new SalesOrderError("Auftrag nicht gefunden.");
    return data;
  }

  /**
   * Vollständige Bearbeitung eines Auftrags (Kunde + Positionen) bis zur Fakturierung —
   * auch während der Produktion (die Fertigungsstückliste wird anschließend neu aufgebaut)
   * und nach Teillieferung (bereits gelieferte Positionen/Mengen bleiben erhalten, das Repo
   * erzwingt diese Integrität). Nach der Fakturierung gesperrt (§ 14 UStG / Belegkette).
   */
  async updateOrder(orderId: string, companyId: string, lines: SalesLine[]): Promise<void> {
    const data = await this.repo.orderForEdit(orderId);
    if (!data) throw new SalesOrderError("Auftrag nicht gefunden.");
    if (!isOrderEditable(data.status)) throw new SalesOrderError("Auftrag ist versendet/fakturiert — nur noch Storno möglich, keine Bearbeitung.");
    if (data.invoiced) throw new SalesOrderError("Auftrag ist bereits fakturiert — keine Bearbeitung mehr möglich.");
    if (!companyId.trim()) throw new SalesOrderError("Firma ist Pflicht.");
    validateLines(lines);
    if (!(await this.repo.companyExists(companyId))) throw new SalesOrderError("Unbekannte Firma.");
    await this.repo.updateOrder(orderId, companyId, lines);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { lineCount: lines.length, companyId } }));
  }
}
