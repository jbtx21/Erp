// In-Memory-Verkaufschancen für Tests.

import type { OpportunityRepository, OpportunityRow } from "../modules/opportunity/opportunity.service.js";

export class InMemoryOpportunityRepository implements OpportunityRepository {
  public items: OpportunityRow[] = [];
  private seq = 0;
  async list(): Promise<OpportunityRow[]> { return this.items; }
  async create(input: { title: string; companyId: string | null; stage: OpportunityRow["stage"]; valueCents: number; probability: number }): Promise<{ id: string }> {
    const id = `opp_${String(++this.seq)}`;
    this.items.push({ id, ...input, status: "OFFEN", lostReason: null });
    return { id };
  }
  async get(id: string): Promise<OpportunityRow | null> { return this.items.find((o) => o.id === id) ?? null; }
  async update(id: string, patch: Partial<OpportunityRow>): Promise<void> {
    const o = this.items.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  }
}
