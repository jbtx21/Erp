// In-Memory-Implementierung des Reporting-Repositories — für Tests/Durchstiche.
// Hält Umsatz- und Auftragsdatenpunkte als einfache Listen.

import type { LabeledRevenuePoint, OrderPoint, QuotePoint, RevenuePoint } from "@texma/shared";
import type { ReportingRepository } from "../modules/reporting/reporting.service.js";

export class InMemoryReportingRepository implements ReportingRepository {
  constructor(
    private readonly revenue: RevenuePoint[] = [],
    private readonly orders: OrderPoint[] = [],
    private readonly byShop: LabeledRevenuePoint[] = [],
    private readonly byPriceGroup: LabeledRevenuePoint[] = [],
    private readonly byArticle: LabeledRevenuePoint[] = [],
    private readonly quotes: QuotePoint[] = []
  ) {}

  async revenuePoints(): Promise<RevenuePoint[]> {
    return this.revenue;
  }

  async orderPoints(): Promise<OrderPoint[]> {
    return this.orders;
  }

  async revenueByShopPoints(): Promise<LabeledRevenuePoint[]> {
    return this.byShop;
  }

  async revenueByPriceGroupPoints(): Promise<LabeledRevenuePoint[]> {
    return this.byPriceGroup;
  }

  async revenueByArticlePoints(): Promise<LabeledRevenuePoint[]> {
    return this.byArticle;
  }

  async quotePoints(): Promise<QuotePoint[]> {
    return this.quotes;
  }
}
