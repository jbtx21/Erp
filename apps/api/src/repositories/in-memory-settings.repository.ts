// In-Memory-Einstellungen für Tests.

import type { SettingsRepository } from "../modules/settings/settings.service.js";

export class InMemorySettingsRepository implements SettingsRepository {
  private kv = new Map<string, string>();
  private threshold: { maxDiscountPct: number | null; maxOrderValueCents: number | null } = { maxDiscountPct: null, maxOrderValueCents: null };
  private markup = 1.88;

  async getSetting(key: string): Promise<string | null> { return this.kv.get(key) ?? null; }
  async setSetting(key: string, value: string): Promise<void> { this.kv.set(key, value); }
  async getApprovalThreshold(): Promise<{ maxDiscountPct: number | null; maxOrderValueCents: number | null }> { return this.threshold; }
  async setApprovalThreshold(input: { maxDiscountPct: number | null; maxOrderValueCents: number | null }): Promise<void> { this.threshold = input; }
  async getMarkupFactor(): Promise<number> { return this.markup; }
  async setMarkupFactor(factor: number): Promise<void> { this.markup = factor; }
}
