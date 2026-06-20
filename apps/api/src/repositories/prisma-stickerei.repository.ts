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
import type {
  CompanyOption,
  CreateLogoVersionInput,
  LogoMarkupContext,
  LogoOption,
  StickereiRepository,
} from "../modules/stickerei/stickerei.service.js";

/** Einheitliches Logo-Label: „Firma · vN (aktiv)". */
function logoLabel(companyName: string, version: number, active: boolean): string {
  return `${companyName} · v${version}${active ? " (aktiv)" : ""}`;
}

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

  async listLogos(): Promise<LogoOption[]> {
    const rows = await prisma.logoVersion.findMany({
      select: { id: true, companyId: true, version: true, active: true, company: { select: { name: true } } },
      orderBy: [{ company: { name: "asc" } }, { version: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      version: r.version,
      active: r.active,
      companyName: r.company.name,
      label: logoLabel(r.company.name, r.version, r.active),
    }));
  }

  async listCompanies(): Promise<CompanyOption[]> {
    return prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  async createLogoVersion(input: CreateLogoVersionInput): Promise<LogoOption> {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: input.companyId }, select: { name: true } });
      if (!company) throw new Error(`Firma ${input.companyId} nicht gefunden.`);
      const max = await tx.logoVersion.aggregate({
        where: { companyId: input.companyId },
        _max: { version: true },
      });
      const version = (max._max.version ?? 0) + 1;
      if (input.active) {
        await tx.logoVersion.updateMany({
          where: { companyId: input.companyId, active: true },
          data: { active: false, replacedAt: new Date() },
        });
      }
      const created = await tx.logoVersion.create({
        data: { companyId: input.companyId, version, fileRef: input.fileRef, active: input.active },
        select: { id: true, companyId: true, version: true, active: true },
      });
      return {
        ...created,
        companyName: company.name,
        label: logoLabel(company.name, created.version, created.active),
      };
    });
  }

  async setLogoActive(logoVersionId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const target = await tx.logoVersion.findUnique({
        where: { id: logoVersionId },
        select: { companyId: true },
      });
      if (!target) throw new Error(`Logo-Version ${logoVersionId} nicht gefunden.`);
      await tx.logoVersion.updateMany({
        where: { companyId: target.companyId, active: true, id: { not: logoVersionId } },
        data: { active: false, replacedAt: new Date() },
      });
      await tx.logoVersion.update({ where: { id: logoVersionId }, data: { active: true, replacedAt: null } });
    });
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
