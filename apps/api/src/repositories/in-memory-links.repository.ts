// In-Memory-Verknüpfungen für Tests: feste Auftrags-→Belege-Zuordnung.

import type { LinksRepository, OrderLinks } from "../modules/links/links.service.js";

export class InMemoryLinksRepository implements LinksRepository {
  constructor(private readonly data: Record<string, OrderLinks> = {}) {}
  set(orderId: string, links: OrderLinks): void { this.data[orderId] = links; }
  async orderLinks(orderId: string): Promise<OrderLinks | null> {
    return this.data[orderId] ?? null;
  }
}
