// Prisma-Implementierung des Produktionszettel-Repositories (Produktionspfad, T-11).
// Basisfelder aus PA → Auftrag (Nummer), erster Stücklisten-Variante (Artikelname,
// Farbe/Größe aus den Variantenattributen, Menge) und aktiver Logo-Version der Firma.

import { prisma } from "@texma/db";
import type { ProductionSheetInput } from "@texma/shared";
import type { ProductionSheetRepository } from "../modules/production-sheet/production-sheet.service.js";

export class PrismaProductionSheetRepository implements ProductionSheetRepository {
  async gatherBase(productionId: string): Promise<Partial<ProductionSheetInput> | null> {
    const prod = await prisma.productionOrder.findUnique({
      where: { id: productionId },
      select: {
        order: {
          select: {
            number: true,
            company: {
              select: { logoVersions: { where: { active: true }, select: { version: true }, take: 1 } },
            },
          },
        },
        bomItems: {
          where: { variantId: { not: null } },
          take: 1,
          select: {
            qty: true,
            variant: {
              select: {
                article: { select: { name: true } },
                attributes: { select: { name: true, value: true } },
              },
            },
          },
        },
      },
    });
    if (!prod) return null;

    const bom = prod.bomItems[0];
    const attrs = new Map((bom?.variant?.attributes ?? []).map((a) => [a.name, a.value]));
    const logo = prod.order.company.logoVersions[0];

    return {
      orderNumber: prod.order.number,
      articleName: bom?.variant?.article.name ?? "",
      farbe: attrs.get("Farbe") ?? "",
      groesse: attrs.get("Größe") ?? "",
      qty: bom?.qty ?? 0,
      logoLabel: logo ? `Logo v${logo.version}` : "",
    };
  }
}
