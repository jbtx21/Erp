// In-Memory-Katalog-Repository für Unit-Tests/Dev.

import type { CatalogEntry } from "@texma/shared";
import type { CatalogRepository } from "../modules/ai-quote/ai-quote.service.js";

export class InMemoryCatalogRepository implements CatalogRepository {
  constructor(private readonly entries: CatalogEntry[] = []) {}

  async catalog(): Promise<CatalogEntry[]> {
    return this.entries.map((e) => ({ ...e }));
  }
}
