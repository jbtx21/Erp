// Prisma-Implementierung des Stickerei-Repositories (Produktionspfad, Kap. 5.4 / 4.4).

import { prisma } from "@texma/db";
import {
  DEFAULT_MARKUP_CONFIG,
  type FinishingType,
  type MarkupConfig,
  type MarkupRule,
  type StickereiContext,
  type StickereiStaffel,
} from "@texma/shared";
import type { LogoMarkupContext, StickereiRepository } from "../modules/stickerei/stickerei.service.js";

/** DB-Zeile → reine MarkupRule (Prisma-null → undefined, finishingType typisiert). */
type MarkupRuleRow = {
  id: string;
  factor: number;
  label: string | null;
  priceGroupId: string | null;
  finishingType: string | null;
  minMenge: number | null;
  maxMenge: number | null;
  minEkCents: number | null;
  maxEkCents: number | null;
};
function rowToRule(r: MarkupRuleRow): MarkupRule {
  return {
    id: r.id,
    factor: r.factor,
    ...(r.label != null ? { label: r.label } : {}),
    ...(r.priceGroupId != null ? { priceGroupId: r.priceGroupId } : {}),
    ...(r.finishingType != null ? { finishingType: r.finishingType as FinishingType } : {}),
    ...(r.minMenge != null ? { minMenge: r.minMenge } : {}),
    ...(r.maxMenge != null ? { maxMenge: r.maxMenge } : {}),
    ...(r.minEkCents != null ? { minEkCents: r.minEkCents } : {}),
    ...(r.maxEkCents != null ? { maxEkCents: r.maxEkCents } : {}),
  };
}

export class PrismaStickereiRepository implements StickereiRepository {
  async contextForCompany(companyId: string): Promise<StickereiContext | null> {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { stickereiPartnerId: true, hatStickdatei: true },
    });
    if (!c) return null;
    return { stickereiPartnerId: c.stickereiPartnerId, hatStickdatei: c.hatStickdatei };
  }

  async listStaffeln(logoVersionId: string): Promise<StickereiStaffel[]> {
    const rows = await prisma.stickereiStaffel.findMany({
      where: { logoVersionId },
      select: { minMenge: true, ekCents: true },
      orderBy: { minMenge: "asc" },
    });
    return rows.map((r) => ({ minMenge: r.minMenge, ekCents: r.ekCents }));
  }

  async replaceStaffeln(
    logoVersionId: string,
    staffeln: ReadonlyArray<StickereiStaffel>
  ): Promise<void> {
    await prisma.$transaction([
      prisma.stickereiStaffel.deleteMany({ where: { logoVersionId } }),
      prisma.stickereiStaffel.createMany({
        data: staffeln.map((s) => ({ logoVersionId, minMenge: s.minMenge, ekCents: s.ekCents })),
      }),
    ]);
  }

  async getMarkupConfig(): Promise<MarkupConfig> {
    const [cfg, rules] = await Promise.all([
      prisma.markupConfig.findUnique({ where: { id: "GLOBAL" }, select: { defaultFactor: true } }),
      prisma.markupRule.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    return {
      defaultFactor: cfg?.defaultFactor ?? DEFAULT_MARKUP_CONFIG.defaultFactor,
      rules: rules.map(rowToRule),
    };
  }

  async saveMarkupConfig(config: MarkupConfig): Promise<MarkupConfig> {
    await prisma.$transaction([
      prisma.markupConfig.upsert({
        where: { id: "GLOBAL" },
        update: { defaultFactor: config.defaultFactor },
        create: { id: "GLOBAL", defaultFactor: config.defaultFactor },
      }),
      prisma.markupRule.deleteMany({}),
      prisma.markupRule.createMany({
        data: config.rules.map((r, i) => ({
          factor: r.factor,
          label: r.label ?? null,
          priceGroupId: r.priceGroupId ?? null,
          finishingType: r.finishingType ?? null,
          minMenge: r.minMenge ?? null,
          maxMenge: r.maxMenge ?? null,
          minEkCents: r.minEkCents ?? null,
          maxEkCents: r.maxEkCents ?? null,
          sortOrder: i,
        })),
      }),
    ]);
    return this.getMarkupConfig();
  }

  async logoMarkupContext(logoVersionId: string): Promise<LogoMarkupContext> {
    const lv = await prisma.logoVersion.findUnique({
      where: { id: logoVersionId },
      select: { markupFactor: true, company: { select: { priceGroupId: true } } },
    });
    return {
      logoOverride: lv?.markupFactor ?? null,
      ...(lv?.company.priceGroupId ? { priceGroupId: lv.company.priceGroupId } : {}),
    };
  }

  async setLogoOverride(logoVersionId: string, factor: number | null): Promise<void> {
    await prisma.logoVersion.update({ where: { id: logoVersionId }, data: { markupFactor: factor } });
  }
}
