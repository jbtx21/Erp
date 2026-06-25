// In-Memory-Finanz-Reporting-Repository für Unit-Tests/Dev.

import type { AgingItem } from "@texma/shared";
import type { FinanceReportRepository } from "../modules/finance-report/finance-report.service.js";

export class InMemoryFinanceReportRepository implements FinanceReportRepository {
  constructor(
    private readonly openItems: AgingItem[] = [],
    private readonly revenue: number = 0,
    private readonly revenueGross: number = 0
  ) {}

  async listOpenItems(): Promise<AgingItem[]> {
    return this.openItems.map((i) => ({ ...i }));
  }

  async revenueNetCents(): Promise<number> {
    return this.revenue;
  }

  async revenueGrossCents(): Promise<number> {
    return this.revenueGross || this.revenue;
  }
}
