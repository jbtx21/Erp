// In-Memory-Implementierung der globalen Suche (Tests/Dev).

import type { SearchHit, SearchRepository } from "../modules/search/search.service.js";

export interface SearchSeed {
  companies?: { id: string; name: string; branche?: string | null }[];
  suppliers?: { id: string; name: string; kind?: string | null }[];
  orders?: { id: string; number: string; externalNumber?: string | null; status?: string | null }[];
  variants?: { id: string; sku: string; articleName?: string | null }[];
  leads?: { id: string; name: string; email?: string | null }[];
}

const has = (hay: string | null | undefined, needle: string): boolean =>
  (hay ?? "").toLowerCase().includes(needle.toLowerCase());

export class InMemorySearchRepository implements SearchRepository {
  constructor(private readonly seed: SearchSeed = {}) {}

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const hits: SearchHit[] = [
      ...(this.seed.companies ?? []).filter((c) => has(c.name, query))
        .map((c) => ({ entity: "Firma", id: c.id, label: c.name, sub: c.branche ?? null, navKey: "companies" })),
      ...(this.seed.suppliers ?? []).filter((s) => has(s.name, query))
        .map((s) => ({ entity: "Lieferant", id: s.id, label: s.name, sub: s.kind ?? null, navKey: "suppliers" })),
      ...(this.seed.orders ?? []).filter((o) => has(o.number, query) || has(o.externalNumber, query))
        .map((o) => ({ entity: "Auftrag", id: o.id, label: o.number, sub: o.status ?? null, navKey: "orders" })),
      ...(this.seed.variants ?? []).filter((v) => has(v.sku, query))
        .map((v) => ({ entity: "Artikel", id: v.id, label: v.sku, sub: v.articleName ?? null, navKey: "products" })),
      ...(this.seed.leads ?? []).filter((l) => has(l.name, query) || has(l.email, query))
        .map((l) => ({ entity: "Lead", id: l.id, label: l.name, sub: l.email ?? null, navKey: "leads" })),
    ];
    return hits.slice(0, limit);
  }
}
