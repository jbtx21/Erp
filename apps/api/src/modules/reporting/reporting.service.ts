// Anwendungsfall: Reporting / Auswertungen (Kap. 29). Bindet die reine Aggregations-
// logik (@texma/shared: bucketRevenue/comparePeriods) an die Umsatz- (Rechnungen) und
// Auftragsdaten. Liefert Umsatz-Übersicht, Auftrags-Übersicht und Periodenvergleich
// (Tag/Woche/Monat/Jahr) sowie — optional — eine KI-Zusammenfassung über einen
// einsteckbaren AiReportClient (Claude). Repository als Interface → testbar ohne DB;
// der KI-Client ist optional (graceful degradation ohne ANTHROPIC_API_KEY).

import {
  breakdownRevenue,
  bucketRevenue,
  comparePeriods,
  totalRevenueCents,
  type Granularity,
  type LabeledRevenuePoint,
  type OrderPoint,
  type PeriodComparison,
  type RevenueBreakdownItem,
  type RevenueBucket,
  type RevenuePoint,
} from "@texma/shared";
import { buildReportPrompt } from "./report-prompt.js";
import { buildReportDocument } from "./report-document.js";
import { renderReportPdf } from "../../pdf/report-pdf.js";

/** Liest die für Auswertungen nötigen Roh-Datenpunkte (read-only). */
export interface ReportingRepository {
  /** Ein Datenpunkt je (finalisierter) Rechnung: Rechnungsdatum + Nettobetrag. */
  revenuePoints(): Promise<RevenuePoint[]>;
  /** Ein Datenpunkt je Auftrag: Auftragsdatum + Auftragswert (Summe der Positionen). */
  orderPoints(): Promise<OrderPoint[]>;
  /** Umsatz je Rechnung mit Shop-Dimension (Herkunfts-Shop, „manuell" wenn ohne). */
  revenueByShopPoints(): Promise<LabeledRevenuePoint[]>;
  /** Umsatz je Rechnung mit Kundengruppen-Dimension (Preisgruppe der Firma). */
  revenueByPriceGroupPoints(): Promise<LabeledRevenuePoint[]>;
}

/**
 * Port für die KI-Erzählung (Kap. 29 „KI-Reporting"). Implementiert von einem
 * Claude-gestützten Client (anthropic-report-client.ts). Bewusst minimal, damit
 * Tests einen Fake einsetzen können.
 */
export interface AiReportClient {
  /** Erzeugt eine natürlichsprachliche Zusammenfassung aus dem Kennzahlen-Prompt. */
  summarize(prompt: string): Promise<string>;
}

export interface RevenueOverview {
  granularity: Granularity;
  buckets: RevenueBucket[];
  totalNetCents: number;
}

export interface OrderOverview {
  granularity: Granularity;
  buckets: RevenueBucket[];
  totalNetCents: number;
  totalCount: number;
}

export interface AiSummary {
  /** true, wenn ein KI-Client konfiguriert war und geantwortet hat. */
  aiGenerated: boolean;
  narrative: string;
}

export interface ReportPdf {
  fileName: string;
  pdfBase64: string;
}

export class ReportingService {
  constructor(
    private readonly repo: ReportingRepository,
    /** Optional — ohne API-Schlüssel null, dann liefert aiSummary eine Heuristik. */
    private readonly ai: AiReportClient | null = null
  ) {}

  /** Umsatz-Übersicht (Netto je Periode) + Gesamtsumme (Kap. 29). */
  async revenueOverview(granularity: Granularity): Promise<RevenueOverview> {
    const points = await this.repo.revenuePoints();
    return {
      granularity,
      buckets: bucketRevenue(points, granularity),
      totalNetCents: totalRevenueCents(points),
    };
  }

  /** Auftrags-Übersicht (Anzahl + Auftragswert je Periode) + Gesamtsummen (Kap. 29). */
  async orderOverview(granularity: Granularity): Promise<OrderOverview> {
    const points = await this.repo.orderPoints();
    const buckets = bucketRevenue(points, granularity);
    return {
      granularity,
      buckets,
      totalNetCents: totalRevenueCents(points),
      totalCount: points.length,
    };
  }

  /** Umsatz nach Shop aufgeschlüsselt (Kap. 29), absteigend mit Anteilen. */
  async revenueByShop(): Promise<RevenueBreakdownItem[]> {
    return breakdownRevenue(await this.repo.revenueByShopPoints());
  }

  /** Umsatz nach Kundengruppe (Preisgruppe) aufgeschlüsselt (Kap. 29). */
  async revenueByPriceGroup(): Promise<RevenueBreakdownItem[]> {
    return breakdownRevenue(await this.repo.revenueByPriceGroupPoints());
  }

  /** Umsatz: aktuelle vs. vorhergehende Periode (Tag/Woche/Monat/Jahr). */
  async compareRevenue(granularity: Granularity, reference: Date): Promise<PeriodComparison> {
    return comparePeriods(await this.repo.revenuePoints(), granularity, reference);
  }

  /** Erzeugt die Umsatz-Auswertung als druckbares PDF (Kap. 29) — base64-kodiert. */
  async exportPdf(granularity: Granularity, reference: Date): Promise<ReportPdf> {
    const [revenuePoints, orderPoints, byShop, byPriceGroup] = await Promise.all([
      this.repo.revenuePoints(),
      this.repo.orderPoints(),
      this.repo.revenueByShopPoints(),
      this.repo.revenueByPriceGroupPoints(),
    ]);
    const document = buildReportDocument({
      granularity,
      generatedAt: reference,
      revenueBuckets: bucketRevenue(revenuePoints, granularity),
      orderBuckets: bucketRevenue(orderPoints, granularity),
      byShop: breakdownRevenue(byShop),
      byPriceGroup: breakdownRevenue(byPriceGroup),
      comparison: comparePeriods(revenuePoints, granularity, reference),
    });
    const bytes = await renderReportPdf(document);
    return {
      fileName: `Umsatz-Auswertung-${granularity}.pdf`,
      pdfBase64: Buffer.from(bytes).toString("base64"),
    };
  }

  /** Aufträge: aktuelle vs. vorhergehende Periode (Tag/Woche/Monat/Jahr). */
  async compareOrders(granularity: Granularity, reference: Date): Promise<PeriodComparison> {
    return comparePeriods(await this.repo.orderPoints(), granularity, reference);
  }

  /**
   * KI-gestützte Zusammenfassung der aktuellen Kennzahlen (Kap. 29). Ist kein
   * AiReportClient konfiguriert (kein ANTHROPIC_API_KEY) oder schlägt der Aufruf fehl,
   * wird eine deterministische Heuristik geliefert (`aiGenerated: false`) — der Bericht
   * bleibt verfügbar, nur ohne KI-Prosa.
   */
  async aiSummary(granularity: Granularity, reference: Date): Promise<AiSummary> {
    const [revenuePoints, orderPoints] = await Promise.all([
      this.repo.revenuePoints(),
      this.repo.orderPoints(),
    ]);
    const revenueBuckets = bucketRevenue(revenuePoints, granularity);
    const orderBuckets = bucketRevenue(orderPoints, granularity);
    const revenueComparison = comparePeriods(revenuePoints, granularity, reference);
    const orderComparison = comparePeriods(orderPoints, granularity, reference);

    const prompt = buildReportPrompt({
      granularity,
      revenueBuckets,
      orderBuckets,
      revenueComparison,
      orderComparison,
    });

    if (this.ai) {
      try {
        const narrative = await this.ai.summarize(prompt);
        if (narrative.trim().length > 0) return { aiGenerated: true, narrative: narrative.trim() };
      } catch {
        // Netzfehler/kein Budget → still auf die Heuristik zurückfallen.
      }
    }
    return { aiGenerated: false, narrative: heuristicSummary(revenueComparison, orderComparison) };
  }
}

/** Deterministische Ersatz-Zusammenfassung ohne KI (für Tests/Offline). */
function heuristicSummary(revenue: PeriodComparison, orders: PeriodComparison): string {
  const trend =
    revenue.deltaCents > 0 ? "gestiegen" : revenue.deltaCents < 0 ? "gesunken" : "unverändert";
  const pct = revenue.deltaPercent === null ? "" : ` (${revenue.deltaPercent > 0 ? "+" : ""}${revenue.deltaPercent} %)`;
  return (
    `Umsatz der Periode ${revenue.current.key} ist gegenüber der Vorperiode ${trend}${pct}. ` +
    `Aufträge in ${orders.current.key}: ${orders.current.count}.`
  );
}
