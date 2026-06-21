// Prisma-Implementierung der Preisquellen (Produktionspfad, B4). Lädt die Preisgruppe
// der Firma, die kundenindividuelle Staffel, die Preisgruppen-Staffel und die
// Einzelpreise je Preisgruppe — die Präzedenz selbst liegt in resolveBasePrice.

import { prisma } from "@texma/db";
import type { PriceGroupKind, VariantPrice } from "@texma/shared";
import type { PriceContext, PricingRepository } from "../modules/pricing/pricing.service.js";

export class PrismaPricingRepository implements PricingRepository {
  async loadPriceContext(companyId: string, variantId: string): Promise<PriceContext> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { priceGroupId: true, priceGroup: { select: { kind: true } } },
    });
    if (!company) throw new Error(`Company ${companyId} nicht gefunden`);
    const group = company.priceGroup.kind as PriceGroupKind;

    const [customerTiers, groupTiers, prices] = await Promise.all([
      prisma.customerPriceTier.findMany({
        where: { companyId, variantId },
        select: { minMenge: true, netCents: true },
      }),
      prisma.priceGroupPriceTier.findMany({
        where: { variantId, priceGroupId: company.priceGroupId },
        select: { minMenge: true, netCents: true },
      }),
      prisma.priceGroupPrice.findMany({
        where: { variantId },
        select: { netCents: true, priceGroup: { select: { kind: true } } },
      }),
    ]);

    const groupPrices: VariantPrice[] = prices.map((p) => ({
      priceGroup: p.priceGroup.kind as PriceGroupKind,
      netCents: p.netCents,
    }));

    return { group, customerTiers, groupTiers, groupPrices };
  }
}
