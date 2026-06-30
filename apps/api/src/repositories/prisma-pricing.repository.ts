// Prisma-Implementierung der Preisquellen (Produktionspfad, B4). Lädt die Preisgruppe
// der Firma, die kundenindividuelle Staffel, die Preisgruppen-Staffel und die
// Einzelpreise je Preisgruppe — die Präzedenz selbst liegt in resolveBasePrice.

import { prisma } from "@texma/db";
import {
  resolveCustomerPriceGroup,
  resolveSupplierVk,
  type PriceGroupKind,
  type SupplierMarkupEntry,
  type VariantPrice,
} from "@texma/shared";
import type {
  CustomerSupplierGroupRow,
  PriceContext,
  PricingRepository,
  SupplierMarkupRow,
  TierView,
} from "../modules/pricing/pricing.service.js";
import { bpToFactor } from "@texma/shared";

/** Deutscher Anzeigename je Kundengruppe (für ensure einer fehlenden PriceGroup-Zeile). */
const PRICE_GROUP_NAME: Record<PriceGroupKind, string> = {
  STANDARD: "Standard",
  TOP: "Top",
  PREMIUM: "Premium",
  SCHULE: "Schule",
  WIEDERVERKAEUFER: "Wiederverkäufer",
  AGENTUR: "Agentur",
};

export class PrismaPricingRepository implements PricingRepository {
  async loadPriceContext(companyId: string, variantId: string): Promise<PriceContext> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { priceGroupId: true, priceGroup: { select: { kind: true } } },
    });
    if (!company) throw new Error(`Company ${companyId} nicht gefunden`);

    // Genau EIN Textil-Lieferant je Artikel (Kap. 4.4) → über die Variante auflösen.
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      select: { article: { select: { supplierId: true } } },
    });
    const supplierId = variant?.article.supplierId ?? null;

    // Kundengruppe JE LIEFERANT: kundenindividuelle Zuordnung > Firmen-Standardgruppe > STANDARD.
    const perSupplier = supplierId
      ? await prisma.customerSupplierPriceGroup.findUnique({
          where: { companyId_supplierId: { companyId, supplierId } },
          select: { priceGroup: { select: { kind: true } } },
        })
      : null;
    const group = resolveCustomerPriceGroup({
      perSupplierGroup: (perSupplier?.priceGroup.kind ?? null) as PriceGroupKind | null,
      companyDefaultGroup: company.priceGroup.kind as PriceGroupKind,
    });

    const [customerTiers, groupTiers, prices, markupRows, ekAgg] = await Promise.all([
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
      supplierId
        ? prisma.supplierMarkup.findMany({
            where: { supplierId },
            select: { factorBp: true, priceGroup: { select: { kind: true } } },
          })
        : Promise.resolve([] as { factorBp: number; priceGroup: { kind: string } }[]),
      prisma.supplierItem.aggregate({ where: { variantId }, _min: { ekCents: true } }),
    ]);

    const groupPrices: VariantPrice[] = prices.map((p) => ({
      priceGroup: p.priceGroup.kind as PriceGroupKind,
      netCents: p.netCents,
    }));

    // Grund-VK aus dem Lieferanten-Aufschlag berechnen (EK × Faktor(Lieferant, group)). Nur wenn
    // EK UND ein passender Faktor (Gruppe oder STANDARD) vorliegen — sonst null (Rückfall Altpfad).
    const markups: SupplierMarkupEntry[] = markupRows.map((m) => ({
      priceGroup: m.priceGroup.kind as PriceGroupKind,
      factorBp: m.factorBp,
    }));
    const ekCents = ekAgg._min.ekCents ?? null;
    const hasFactor = markups.some((m) => m.priceGroup === group || m.priceGroup === "STANDARD");
    const computedBaseCents =
      ekCents != null && hasFactor ? resolveSupplierVk({ ekCents, markups, group }).vkCents : null;

    return { group, customerTiers, groupTiers, groupPrices, computedBaseCents };
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

  // ── Lieferanten-Aufschlagsmatrix ──

  /** Holt/legt die PriceGroup-Zeile zur Kundengruppe an (kind ist eindeutig). */
  private async ensurePriceGroupId(kind: PriceGroupKind): Promise<string> {
    const row = await prisma.priceGroup.upsert({
      where: { kind },
      update: {},
      create: { kind, name: PRICE_GROUP_NAME[kind] },
      select: { id: true },
    });
    return row.id;
  }

  async listSupplierMarkups(supplierId: string): Promise<SupplierMarkupRow[]> {
    const rows = await prisma.supplierMarkup.findMany({
      where: { supplierId },
      select: { factorBp: true, priceGroup: { select: { kind: true } } },
    });
    return rows.map((r) => ({
      priceGroup: r.priceGroup.kind as PriceGroupKind,
      factorBp: r.factorBp,
      factor: bpToFactor(r.factorBp),
    }));
  }

  async setSupplierMarkup(supplierId: string, kind: PriceGroupKind, factorBp: number): Promise<void> {
    const priceGroupId = await this.ensurePriceGroupId(kind);
    await prisma.supplierMarkup.upsert({
      where: { supplierId_priceGroupId: { supplierId, priceGroupId } },
      update: { factorBp },
      create: { supplierId, priceGroupId, factorBp },
    });
  }

  async removeSupplierMarkup(supplierId: string, kind: PriceGroupKind): Promise<void> {
    const pg = await prisma.priceGroup.findUnique({ where: { kind }, select: { id: true } });
    if (!pg) return;
    await prisma.supplierMarkup.deleteMany({ where: { supplierId, priceGroupId: pg.id } });
  }

  async listCustomerSupplierGroups(companyId: string): Promise<CustomerSupplierGroupRow[]> {
    const rows = await prisma.customerSupplierPriceGroup.findMany({
      where: { companyId },
      select: { supplierId: true, supplier: { select: { name: true } }, priceGroup: { select: { kind: true } } },
    });
    return rows.map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      priceGroup: r.priceGroup.kind as PriceGroupKind,
    }));
  }

  async setCustomerSupplierGroup(companyId: string, supplierId: string, kind: PriceGroupKind): Promise<void> {
    const priceGroupId = await this.ensurePriceGroupId(kind);
    await prisma.customerSupplierPriceGroup.upsert({
      where: { companyId_supplierId: { companyId, supplierId } },
      update: { priceGroupId },
      create: { companyId, supplierId, priceGroupId },
    });
  }

  async removeCustomerSupplierGroup(companyId: string, supplierId: string): Promise<void> {
    await prisma.customerSupplierPriceGroup.deleteMany({ where: { companyId, supplierId } });
  }
}
