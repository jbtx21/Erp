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

    const [customerTiers, groupTiers, standardTiers, prices, markupRules, ekAgg] = await Promise.all([
      prisma.customerPriceTier.findMany({
        where: { companyId, variantId },
        select: { minMenge: true, netCents: true },
      }),
      prisma.priceGroupPriceTier.findMany({
        where: { variantId, priceGroupId: company.priceGroupId },
        select: { minMenge: true, netCents: true },
      }),
      // STANDARD-Basisstaffel (Veredelung/Logo) — greift für alle Kunden als Basis (B4).
      this.listStandardTiers(variantId),
      prisma.priceGroupPrice.findMany({
        where: { variantId },
        select: { netCents: true, priceGroup: { select: { kind: true } } },
      }),
      // Lieferanten-Aufschläge kommen jetzt aus der EINEN Regel-Engine (MarkupRule): Regeln mit
      // supplierId + priceGroupId, OHNE Veredelungsart (finishingType=null = Artikel-Aufschlag).
      supplierId
        ? prisma.markupRule.findMany({
            where: { supplierId, finishingType: null, priceGroupId: { not: null } },
            select: { factor: true, priceGroupId: true },
          })
        : Promise.resolve([] as { factor: number; priceGroupId: string | null }[]),
      prisma.supplierItem.aggregate({ where: { variantId }, _min: { ekCents: true } }),
    ]);

    const groupPrices: VariantPrice[] = prices.map((p) => ({
      priceGroup: p.priceGroup.kind as PriceGroupKind,
      netCents: p.netCents,
    }));

    // priceGroupId → Kind auflösen (MarkupRule hat keine PriceGroup-Relation).
    const ruleGroupIds = [...new Set(markupRules.map((r) => r.priceGroupId).filter((x): x is string => !!x))];
    const ruleGroups = ruleGroupIds.length
      ? await prisma.priceGroup.findMany({ where: { id: { in: ruleGroupIds } }, select: { id: true, kind: true } })
      : [];
    const kindByPgId = new Map(ruleGroups.map((p) => [p.id, p.kind as PriceGroupKind]));

    // Grund-VK aus dem Lieferanten-Aufschlag berechnen (EK × Faktor(Lieferant, group)). Nur wenn
    // EK UND ein passender Faktor (Gruppe oder STANDARD) vorliegen — sonst null (Rückfall Altpfad).
    const markups: SupplierMarkupEntry[] = markupRules
      .map((r) => ({ priceGroup: r.priceGroupId ? kindByPgId.get(r.priceGroupId) : undefined, factorBp: Math.round(r.factor * 10000) }))
      .filter((m): m is SupplierMarkupEntry => m.priceGroup !== undefined);
    const ekCents = ekAgg._min.ekCents ?? null;
    const hasFactor = markups.some((m) => m.priceGroup === group || m.priceGroup === "STANDARD");
    const computedBaseCents =
      ekCents != null && hasFactor ? resolveSupplierVk({ ekCents, markups, group }).vkCents : null;

    return { group, customerTiers, groupTiers, standardTiers, groupPrices, computedBaseCents };
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

  // Lieferanten-Aufschläge sind jetzt Aufschlagsregeln (MarkupRule) der EINEN Engine: eine Regel
  // je (supplierId × priceGroupId), OHNE Veredelungsart (finishingType=null = Artikel-Aufschlag).
  async listSupplierMarkups(supplierId: string): Promise<SupplierMarkupRow[]> {
    const rows = await prisma.markupRule.findMany({
      where: { supplierId, finishingType: null, priceGroupId: { not: null } },
      select: { factor: true, priceGroupId: true },
    });
    const ids = [...new Set(rows.map((r) => r.priceGroupId).filter((x): x is string => !!x))];
    const pgs = ids.length ? await prisma.priceGroup.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true } }) : [];
    const kindById = new Map(pgs.map((p) => [p.id, p.kind as PriceGroupKind]));
    return rows
      .map((r) => ({ kind: r.priceGroupId ? kindById.get(r.priceGroupId) : undefined, factor: r.factor }))
      .filter((r): r is { kind: PriceGroupKind; factor: number } => r.kind !== undefined)
      .map((r) => ({ priceGroup: r.kind, factorBp: Math.round(r.factor * 10000), factor: r.factor }));
  }

  async setSupplierMarkup(supplierId: string, kind: PriceGroupKind, factorBp: number): Promise<void> {
    const priceGroupId = await this.ensurePriceGroupId(kind);
    const factor = bpToFactor(factorBp);
    // Kein @@unique(supplierId, priceGroupId) auf MarkupRule → findFirst + update/create.
    const existing = await prisma.markupRule.findFirst({ where: { supplierId, priceGroupId, finishingType: null }, select: { id: true } });
    if (existing) await prisma.markupRule.update({ where: { id: existing.id }, data: { factor } });
    else await prisma.markupRule.create({ data: { supplierId, priceGroupId, factor, label: "Lieferanten-Aufschlag" } });
  }

  async removeSupplierMarkup(supplierId: string, kind: PriceGroupKind): Promise<void> {
    const pg = await prisma.priceGroup.findUnique({ where: { kind }, select: { id: true } });
    if (!pg) return;
    await prisma.markupRule.deleteMany({ where: { supplierId, priceGroupId: pg.id, finishingType: null } });
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
