import type { GutscheinRecord, GutscheinRepository } from "../modules/gutschein/gutschein.service.js";

let seq = 0;

export class InMemoryGutscheinRepository implements GutscheinRepository {
  private readonly rows: GutscheinRecord[] = [];

  async list(): Promise<GutscheinRecord[]> {
    return this.rows.map((r) => ({ ...r }));
  }
  async findByCode(code: string): Promise<GutscheinRecord | null> {
    const r = this.rows.find((x) => x.code === code);
    return r ? { ...r } : null;
  }
  async create(input: { code: string; initialCents: number; validUntil: Date | null; note: string | null }): Promise<GutscheinRecord> {
    const rec: GutscheinRecord = {
      id: `gs-${++seq}`, code: input.code, initialCents: input.initialCents, remainingCents: input.initialCents,
      validUntil: input.validUntil, note: input.note, active: true, createdAt: new Date(0),
    };
    this.rows.push(rec);
    return { ...rec };
  }
  async setRemaining(id: string, remainingCents: number): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.remainingCents = remainingCents;
  }
}
