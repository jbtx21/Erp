// In-Memory-Implementierung des Stickerei-Repositories — für Tests/Durchstiche.

import type { StickereiContext } from "@texma/shared";
import type { StickereiRepository } from "../modules/stickerei/stickerei.service.js";

export class InMemoryStickereiRepository implements StickereiRepository {
  constructor(private readonly byCompany: Record<string, StickereiContext>) {}

  async contextForCompany(companyId: string): Promise<StickereiContext | null> {
    return this.byCompany[companyId] ?? null;
  }
}
