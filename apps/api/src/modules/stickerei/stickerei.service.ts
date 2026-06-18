// Anwendungsfall: Stickerei-Partnerwahl (Kap. 5.4). Bindet die reine
// `decideStickereiRoute`-Logik (@texma/shared) an die Firmen-Stammdaten: hinterlegter
// Partner + vorhandene Stickdatei → Direktauftrag, sonst Ausschreibung (Erstauftrag/Logo).
// Reine Lese-Analyse; Repository als Interface.

import { decideStickereiRoute, type StickereiContext, type StickereiRoute } from "@texma/shared";

export interface StickereiRepository {
  contextForCompany(companyId: string): Promise<StickereiContext | null>;
}

export class StickereiService {
  constructor(private readonly repo: StickereiRepository) {}

  async routeForCompany(companyId: string): Promise<{ companyId: string; route: StickereiRoute }> {
    const ctx = await this.repo.contextForCompany(companyId);
    if (!ctx) {
      throw new Error(`Firma ${companyId} nicht gefunden.`);
    }
    return { companyId, route: decideStickereiRoute(ctx) };
  }
}
