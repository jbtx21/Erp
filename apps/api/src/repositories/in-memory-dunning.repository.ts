// In-Memory-Implementierung der Mahnwesen-Repositories — für Tests/lokale Durchstiche.

import type { DunnableItem } from "@texma/shared";
import type { DunningRepository } from "../modules/dunning/dunning.service.js";
import type { DunningOverviewItem, DunningQueryRepository } from "./read.js";

export interface SeedOpenItem extends DunnableItem {
  invoiceNumber: string;
}

export class InMemoryDunningRepository implements DunningRepository, DunningQueryRepository {
  constructor(private readonly items: SeedOpenItem[]) {}

  async listDunnable(): Promise<DunnableItem[]> {
    return this.items.map((i) => ({
      id: i.id,
      openCents: i.openCents,
      dueDate: i.dueDate,
      dunningLevel: i.dunningLevel,
      mahnsperre: i.mahnsperre,
    }));
  }

  async applyDunningLevel(itemId: string, toLevel: number): Promise<void> {
    const it = this.items.find((x) => x.id === itemId);
    if (it) it.dunningLevel = toLevel;
  }

  async listDunning(limit: number): Promise<DunningOverviewItem[]> {
    return this.items.slice(0, limit).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      openCents: i.openCents,
      dueDate: i.dueDate,
      dunningLevel: i.dunningLevel,
      mahnsperre: i.mahnsperre,
    }));
  }
}
