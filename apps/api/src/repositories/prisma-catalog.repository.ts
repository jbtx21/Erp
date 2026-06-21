// Prisma-Implementierung des Katalogs (Produktionspfad, B14). Verkaufsfähige
// Varianten mit Listenpreis der Standard-Preisgruppe.

import { prisma } from "@texma/db";
import type { CatalogEntry } from "@texma/shared";
import type { CatalogRepository } from "../modules/ai-quote/ai-quote.service.js";

export class PrismaCatalogRepository implements CatalogRepository {
  async catalog(): Promise<CatalogEntry[]> {
    const variants = await prisma.variant.findMany({
      select: {
        id: true,
        sku: true,
        article: { select: { name: true } },
        prices: { where: { priceGroup: { kind: "STANDARD" } }, select: { netCents: true }, take: 1 },
      },
    });
    return variants
      .filter((v) => v.prices.length > 0)
      .map((v) => ({ variantId: v.id, sku: v.sku, name: v.article.name, netCents: v.prices[0]!.netCents }));
  }
}
