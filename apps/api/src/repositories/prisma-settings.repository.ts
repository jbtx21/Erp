// Prisma-Einstellungen: AppSetting (Briefkopf) + ApprovalThreshold (Freigabe) +
// MarkupConfig (Aufschlagsfaktor, Singleton id=GLOBAL).

import { prisma } from "@texma/db";
import type { SettingsRepository } from "../modules/settings/settings.service.js";

export class PrismaSettingsRepository implements SettingsRepository {
  async getSetting(key: string): Promise<string | null> {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  async getApprovalThreshold(): Promise<{ maxDiscountPct: number | null; maxOrderValueCents: number | null }> {
    const row = await prisma.approvalThreshold.findFirst();
    return { maxDiscountPct: row?.maxDiscountPct ?? null, maxOrderValueCents: row?.maxOrderValueCents ?? null };
  }
  async setApprovalThreshold(input: { maxDiscountPct: number | null; maxOrderValueCents: number | null }): Promise<void> {
    const row = await prisma.approvalThreshold.findFirst({ select: { id: true } });
    if (row) await prisma.approvalThreshold.update({ where: { id: row.id }, data: input });
    else await prisma.approvalThreshold.create({ data: input });
  }
  async getMarkupFactor(): Promise<number> {
    const row = await prisma.markupConfig.findUnique({ where: { id: "GLOBAL" } });
    return row?.defaultFactor ?? 1.88;
  }
  async setMarkupFactor(factor: number): Promise<void> {
    await prisma.markupConfig.upsert({ where: { id: "GLOBAL" }, update: { defaultFactor: factor }, create: { id: "GLOBAL", defaultFactor: factor } });
  }
}
