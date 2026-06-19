// In-Memory-Implementierung des Reporting-Repositories — für Tests/Durchstiche.
// Hält Umsatz- und Auftragsdatenpunkte als einfache Listen.

import type { OrderPoint, RevenuePoint } from "@texma/shared";
import type { ReportingRepository } from "../modules/reporting/reporting.service.js";

export class InMemoryReportingRepository implements ReportingRepository {
  constructor(
    private readonly revenue: RevenuePoint[] = [],
    private readonly orders: OrderPoint[] = []
  ) {}

  async revenuePoints(): Promise<RevenuePoint[]> {
    return this.revenue;
  }

  async orderPoints(): Promise<OrderPoint[]> {
    return this.orders;
  }
}
