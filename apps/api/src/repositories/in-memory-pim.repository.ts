// In-Memory-PIM-Repository für Unit-Tests/Dev.

import type { TextileLabeling } from "@texma/shared";
import type { PimRepository } from "../modules/pim/pim.service.js";

export class InMemoryPimRepository implements PimRepository {
  private readonly gtins = new Map<string, string>();
  private readonly labeling = new Map<string, TextileLabeling>();

  setArticleLabeling(articleId: string, labeling: TextileLabeling): void {
    this.labeling.set(articleId, labeling);
  }

  gtinOf(variantId: string): string | undefined {
    return this.gtins.get(variantId);
  }

  async setVariantGtin(variantId: string, gtin: string): Promise<void> {
    this.gtins.set(variantId, gtin);
  }

  async loadArticleLabeling(articleId: string): Promise<TextileLabeling | null> {
    return this.labeling.get(articleId) ?? null;
  }
}
