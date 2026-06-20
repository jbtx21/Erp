// In-Memory-Implementierung des Stickerei-Repositories — für Tests/Durchstiche.

import type { StickereiContext, StickereiStaffel } from "@texma/shared";
import type { StickereiRepository } from "../modules/stickerei/stickerei.service.js";

export class InMemoryStickereiRepository implements StickereiRepository {
  private readonly staffeln: Map<string, StickereiStaffel[]>;

  constructor(
    private readonly byCompany: Record<string, StickereiContext> = {},
    seedStaffeln: Record<string, StickereiStaffel[]> = {}
  ) {
    this.staffeln = new Map(Object.entries(seedStaffeln).map(([k, v]) => [k, [...v]]));
  }

  async contextForCompany(companyId: string): Promise<StickereiContext | null> {
    return this.byCompany[companyId] ?? null;
  }

  async listStaffeln(logoVersionId: string): Promise<StickereiStaffel[]> {
    return [...(this.staffeln.get(logoVersionId) ?? [])];
  }

  async replaceStaffeln(
    logoVersionId: string,
    staffeln: ReadonlyArray<StickereiStaffel>
  ): Promise<void> {
    this.staffeln.set(
      logoVersionId,
      staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents }))
    );
  }
}
