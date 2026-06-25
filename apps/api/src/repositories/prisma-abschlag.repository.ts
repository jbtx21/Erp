import { prisma } from "@texma/db";
import type { AbschlagRecord, AbschlagRepository, OrderForAbschlag } from "../modules/abschlag/abschlag.service.js";

// Globaler USt-Satz (zentral, Einstellungen) — gleiche Quelle wie SettingsService.
const DEFAULT_TAX_RATE_KEY = "default_tax_rate_pct";
const DEFAULT_TAX_RATE_PCT = 19;

export class PrismaAbschlagRepository implements AbschlagRepository {
  async loadOrderForAbschlag(orderId: string): Promise<OrderForAbschlag | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: { select: { qty: true, unitNetCents: true } }, company: { select: { zahlungszielTage: true } } },
    });
    if (!o) return null;
    const setting = await prisma.appSetting.findUnique({ where: { key: DEFAULT_TAX_RATE_KEY } });
    const parsed = setting ? Number(setting.value) : NaN;
    const taxRatePct = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_TAX_RATE_PCT;
    return {
      id: o.id,
      number: o.number,
      companyId: o.companyId,
      orderNetCents: o.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0),
      taxRatePct,
      zahlungszielTage: o.company.zahlungszielTage,
    };
  }

  async listForOrder(orderId: string): Promise<AbschlagRecord[]> {
    return prisma.abschlagsrechnung.findMany({ where: { orderId }, orderBy: { issuedAt: "asc" } });
  }

  async create(input: Omit<AbschlagRecord, "id" | "issuedAt" | "bezahlt">): Promise<AbschlagRecord> {
    return prisma.abschlagsrechnung.create({ data: input });
  }

  async setBezahlt(id: string, bezahlt: boolean): Promise<void> {
    await prisma.abschlagsrechnung.update({ where: { id }, data: { bezahlt } });
  }
}
