// In-Memory-Portal-Repository für Unit-Tests/Dev.

import type {
  CustomerOrderView,
  PortalRepository,
} from "../modules/portal/portal.service.js";

interface Row extends CustomerOrderView {
  companyId: string;
}

export class InMemoryPortalRepository implements PortalRepository {
  constructor(private readonly rows: Row[] = []) {}

  async ordersForCompany(companyId: string): Promise<CustomerOrderView[]> {
    return this.rows
      .filter((r) => r.companyId === companyId)
      .map((r) => ({
        number: r.number,
        status: r.status,
        zugesagterLiefertermin: r.zugesagterLiefertermin,
        trackingNumber: r.trackingNumber,
        createdAt: r.createdAt,
      }));
  }
}
