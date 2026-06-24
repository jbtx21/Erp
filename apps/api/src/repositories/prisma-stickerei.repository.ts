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
  AusschreibungRaw,
  AusschreibungStatus,
  AusschreibungSummary,
  CompanyOption,
  LogoFile,
  LogoMarkupContext,
  LogoOption,
  StickereiRepository,
  StoredLogoFile,
  StoredLogoVersion,
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

  async setPartner(companyId: string, supplierId: string | null): Promise<void> {
    await prisma.company.update({ where: { id: companyId }, data: { stickereiPartnerId: supplierId } });
  }

  async listLogos(): Promise<LogoOption[]> {
    const rows = await prisma.logoVersion.findMany({
      select: { id: true, companyId: true, version: true, active: true, fileName: true, company: { select: { name: true } } },
      orderBy: [{ company: { name: "asc" } }, { version: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      version: r.version,
      active: r.active,
      companyName: r.company.name,
      ...(r.fileName ? { fileName: r.fileName } : {}),
      label: logoLabel(r.company.name, r.version, r.active),
    }));
  }

  async listCompanies(): Promise<CompanyOption[]> {
    return prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  async createLogoVersion(input: StoredLogoVersion): Promise<LogoOption> {
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
        data: {
          companyId: input.companyId,
          version,
          fileRef: input.fileName, // Verweis = Originaldateiname (Bytes inline gespeichert)
          active: input.active,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.data.length,
          fileData: new Uint8Array(input.data),
        },
        select: { id: true, companyId: true, version: true, active: true, fileName: true },
      });
      return {
        id: created.id,
        companyId: created.companyId,
        version: created.version,
        active: created.active,
        fileName: created.fileName ?? input.fileName,
        companyName: company.name,
        label: logoLabel(company.name, created.version, created.active),
      };
    });
  }

  async replaceLogoFile(input: StoredLogoFile): Promise<LogoOption> {
    const updated = await prisma.logoVersion.update({
      where: { id: input.logoVersionId },
      data: {
        fileRef: input.fileName,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.data.length,
        fileData: new Uint8Array(input.data),
      },
      select: { id: true, companyId: true, version: true, active: true, fileName: true, company: { select: { name: true } } },
    });
    return {
      id: updated.id,
      companyId: updated.companyId,
      version: updated.version,
      active: updated.active,
      companyName: updated.company.name,
      ...(updated.fileName ? { fileName: updated.fileName } : {}),
      label: logoLabel(updated.company.name, updated.version, updated.active),
    };
  }

  async deleteLogoVersion(logoVersionId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const target = await tx.logoVersion.findUnique({
        where: { id: logoVersionId },
        select: { companyId: true, active: true },
      });
      if (!target) throw new Error(`Logo-Version ${logoVersionId} nicht gefunden.`);
      await tx.logoVersion.delete({ where: { id: logoVersionId } });
      // War es die aktive Version, rückt die neueste verbleibende nach (genau eine aktiv).
      if (target.active) {
        const newest = await tx.logoVersion.findFirst({
          where: { companyId: target.companyId },
          orderBy: { version: "desc" },
          select: { id: true },
        });
        if (newest) {
          await tx.logoVersion.update({ where: { id: newest.id }, data: { active: true, replacedAt: null } });
        }
      }
    });
  }

  async getLogoFile(logoVersionId: string): Promise<LogoFile | null> {
    const row = await prisma.logoVersion.findUnique({
      where: { id: logoVersionId },
      select: { fileName: true, mimeType: true, fileData: true },
    });
    if (!row?.fileData) return null;
    return {
      fileName: row.fileName ?? "logo",
      mimeType: row.mimeType ?? "application/octet-stream",
      data: Buffer.from(row.fileData),
    };
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

  async createAusschreibung(logoVersionId: string): Promise<{ id: string }> {
    return prisma.stickereiAusschreibung.create({ data: { logoVersionId }, select: { id: true } });
  }

  async addAngebot(
    ausschreibungId: string,
    supplierId: string,
    staffeln: ReadonlyArray<StickereiStaffel>,
    notiz: string | null
  ): Promise<{ id: string }> {
    return prisma.stickereiAngebot.create({
      data: {
        ausschreibungId,
        supplierId,
        notiz,
        staffeln: { create: staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents })) },
      },
      select: { id: true },
    });
  }

  async listAusschreibungen(logoVersionId: string): Promise<AusschreibungSummary[]> {
    const rows = await prisma.stickereiAusschreibung.findMany({
      where: { logoVersionId },
      orderBy: { createdAt: "desc" },
      select: { id: true, logoVersionId: true, status: true, gewinnerAngebotId: true, createdAt: true, _count: { select: { angebote: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      logoVersionId: r.logoVersionId,
      status: r.status as AusschreibungStatus,
      gewinnerAngebotId: r.gewinnerAngebotId,
      angebotCount: r._count.angebote,
      createdAt: r.createdAt,
    }));
  }

  async getAusschreibung(id: string): Promise<AusschreibungRaw | null> {
    const a = await prisma.stickereiAusschreibung.findUnique({
      where: { id },
      include: {
        angebote: {
          orderBy: { createdAt: "asc" },
          include: { supplier: { select: { name: true } }, staffeln: { orderBy: { minMenge: "asc" } } },
        },
      },
    });
    if (!a) return null;
    return {
      id: a.id,
      logoVersionId: a.logoVersionId,
      status: a.status as AusschreibungStatus,
      gewinnerAngebotId: a.gewinnerAngebotId,
      angebote: a.angebote.map((ang) => ({
        id: ang.id,
        supplierId: ang.supplierId,
        supplierName: ang.supplier?.name ?? null,
        notiz: ang.notiz,
        staffeln: ang.staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents })),
      })),
    };
  }

  async decideAusschreibung(ausschreibungId: string, gewinnerAngebotId: string): Promise<{ logoVersionId: string }> {
    return prisma.$transaction(async (tx) => {
      const ausschreibung = await tx.stickereiAusschreibung.findUnique({
        where: { id: ausschreibungId },
        select: { id: true, status: true, logoVersionId: true, logoVersion: { select: { companyId: true } } },
      });
      if (!ausschreibung) throw new Error(`Ausschreibung ${ausschreibungId} nicht gefunden.`);
      if (ausschreibung.status !== "OFFEN") throw new Error("Ausschreibung ist nicht (mehr) offen.");

      const angebot = await tx.stickereiAngebot.findUnique({
        where: { id: gewinnerAngebotId },
        include: { staffeln: true },
      });
      if (!angebot || angebot.ausschreibungId !== ausschreibungId) {
        throw new Error("Gewinner-Angebot gehört nicht zu dieser Ausschreibung.");
      }

      await tx.stickereiAusschreibung.update({
        where: { id: ausschreibungId },
        data: { status: "ENTSCHIEDEN", gewinnerAngebotId, decidedAt: new Date() },
      });
      // Lieferant als Stickerei-Partner der Firma hinterlegen.
      await tx.company.update({ where: { id: ausschreibung.logoVersion.companyId }, data: { stickereiPartnerId: angebot.supplierId } });
      // Gewinner-Staffeln ans Logo übernehmen (Set-Semantik).
      await tx.stickereiStaffel.deleteMany({ where: { logoVersionId: ausschreibung.logoVersionId } });
      await tx.stickereiStaffel.createMany({
        data: angebot.staffeln.map((s) => ({ logoVersionId: ausschreibung.logoVersionId, minMenge: s.minMenge, ekCents: s.ekCents })),
      });
      return { logoVersionId: ausschreibung.logoVersionId };
    });
  }
}
