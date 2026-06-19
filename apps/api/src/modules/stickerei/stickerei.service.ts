// Anwendungsfall: Stickerei-Partnerwahl (Kap. 5.4). Bindet die reine
// `decideStickereiRoute`-Logik (@texma/shared) an die Firmen-Stammdaten: hinterlegter
// Partner + vorhandene Stickdatei → Direktauftrag, sonst Ausschreibung (Erstauftrag/Logo).
// Reine Lese-Analyse; Repository als Interface.

import {
  compareStickereiOffers,
  planStickerei,
  type StickereiComparison,
  type StickereiContext,
  type StickereiOffer,
  type StickereiPlan,
} from "@texma/shared";

export interface StickereiRepository {
  contextForCompany(companyId: string): Promise<StickereiContext | null>;
}

export class StickereiService {
  constructor(private readonly repo: StickereiRepository) {}

  /** Stickerei-Plan einer Firma (Kap. 5.4): Weg + Digitalisierungsbedarf + Begründung. */
  async routeForCompany(companyId: string): Promise<{ companyId: string } & StickereiPlan> {
    const ctx = await this.repo.contextForCompany(companyId);
    if (!ctx) {
      throw new Error(`Firma ${companyId} nicht gefunden.`);
    }
    return { companyId, ...planStickerei(ctx) };
  }

  /** Vergleicht Partner-Angebote einer Ausschreibung für eine Stichzahl (Kap. 5.4). */
  compareOffers(stitches: number, offers: ReadonlyArray<StickereiOffer>): StickereiComparison {
    return compareStickereiOffers(stitches, offers);
  }
}
