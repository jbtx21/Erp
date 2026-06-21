// Prisma-Implementierung des PIM-Repositories (Produktionspfad, B18).

import { prisma } from "@texma/db";
import type { TextileLabeling } from "@texma/shared";
import type { PimRepository } from "../modules/pim/pim.service.js";

export class PrismaPimRepository implements PimRepository {
  async setVariantGtin(variantId: string, gtin: string): Promise<void> {
    await prisma.variant.update({ where: { id: variantId }, data: { gtin } });
  }

  async loadArticleLabeling(articleId: string): Promise<TextileLabeling | null> {
    const a = await prisma.article.findUnique({
      where: { id: articleId },
      select: { materialComposition: true },
    });
    return a ? { materialComposition: a.materialComposition } : null;
  }
}
