// Prisma-Implementierung der Preisquellen (Produktionspfad, B4). Lädt die Preisgruppe
// der Firma, die kundenindividuelle Staffel, die Preisgruppen-Staffel und die
// Einzelpreise je Preisgruppe — die Präzedenz selbst liegt in resolveBasePrice.

import { prisma } from "@texma/db";
import type { PriceGroupKind, VariantPrice } from "@texma/shared";
import type { PriceContext, PricingRepository, TierView } from "../modules/pricing/pricing.service.js";

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

  async listTiers(companyId: string, variantId: string): Promise<TierView> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { priceGroupId: true },
    });
    if (!company) throw new Error(`Company ${companyId} nicht gefunden`);
    const [customerTiers, groupTiers] = await Promise.all([
      prisma.customerPriceTier.findMany({
        where: { companyId, variantId },
        select: { minMenge: true, netCents: true },
        orderBy: { minMenge: "asc" },
      }),
      prisma.priceGroupPriceTier.findMany({
        where: { variantId, priceGroupId: company.priceGroupId },
        select: { minMenge: true, netCents: true },
        orderBy: { minMenge: "asc" },
      }),
    ]);
    return { customerTiers, groupTiers };
  }

  async upsertGroupTier(companyId: string, variantId: string, minMenge: number, netCents: number): Promise<void> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { priceGroupId: true },
    });
    if (!company) throw new Error(`Company ${companyId} nicht gefunden`);
    await prisma.priceGroupPriceTier.upsert({
      where: { variantId_priceGroupId_minMenge: { variantId, priceGroupId: company.priceGroupId, minMenge } },
      update: { netCents },
      create: { variantId, priceGroupId: company.priceGroupId, minMenge, netCents },
    });
  }

  async removeGroupTier(companyId: string, variantId: string, minMenge: number): Promise<void> {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { priceGroupId: true } });
    if (!company) throw new Error(`Company ${companyId} nicht gefunden`);
    await prisma.priceGroupPriceTier.deleteMany({ where: { variantId, priceGroupId: company.priceGroupId, minMenge } });
  }

  async bestEkCents(variantId: string): Promise<number | null> {
    const r = await prisma.supplierItem.aggregate({ where: { variantId }, _min: { ekCents: true } });
    return r._min.ekCents ?? null;
  }

  async listStandardTiers(variantId: string): Promise<{ minMenge: number; netCents: number }[]> {
    // Veredelungs-/Logo-Staffel liegt unter der Basis-Preisgruppe STANDARD (B4) — unabhängig
    // von der Preisgruppe der Firma. So ist die Staffel auch bei Nicht-STANDARD-Kunden sichtbar.
    const std = await prisma.priceGroup.findFirst({ where: { kind: "STANDARD" }, select: { id: true } });
    if (!std) return [];
    return prisma.priceGroupPriceTier.findMany({
      where: { variantId, priceGroupId: std.id },
      select: { minMenge: true, netCents: true },
      orderBy: { minMenge: "asc" },
    });
  }

  async ekTiers(variantId: string): Promise<{ minMenge: number; ekCents: number }[]> {
    return prisma.variantEkTier.findMany({
      where: { variantId },
      select: { minMenge: true, ekCents: true },
      orderBy: { minMenge: "asc" },
    });
  }
}
