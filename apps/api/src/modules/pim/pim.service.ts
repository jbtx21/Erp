// Textil-PIM-Service (B18, Kap. 3). Bindet die reine pim.ts-Validierung an die
// Stammdaten: GTIN-13 wird vor dem Speichern geprüft; die Verkaufsfreigabe eines
// Artikels verlangt die Pflicht-Faserkennzeichnung (EU-VO 1007/2011).

import { assertGtin13, assertSellable, type TextileLabeling } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface PimRepository {
  setVariantGtin(variantId: string, gtin: string): Promise<void>;
  loadArticleLabeling(articleId: string): Promise<TextileLabeling | null>;
}

export class PimService {
  constructor(
    private readonly repo: PimRepository,
    private readonly audit: AuditSink
  ) {}

  /** Setzt die GTIN-13 einer Variante nach Prüfziffer-Validierung. */
  async setVariantGtin(variantId: string, gtin: string): Promise<void> {
    assertGtin13(gtin); // wirft InvalidGtinError bei falscher Prüfziffer
    await this.repo.setVariantGtin(variantId, gtin);
    await this.audit.append(
      buildEntry({ entity: "Variant", entityId: variantId, action: "UPDATE", after: { gtin } })
    );
  }

  /** Prüft die Verkaufsfreigabe — wirft, wenn die Faserkennzeichnung fehlt. */
  async assertArticleSellable(articleId: string): Promise<void> {
    const labeling = await this.repo.loadArticleLabeling(articleId);
    if (!labeling) throw new Error(`Article ${articleId} nicht gefunden`);
    assertSellable(labeling); // wirft LabelingIncompleteError
  }
}
