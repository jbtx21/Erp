// Prisma-Implementierung der Auftrag→Produktionsauftrag-Erzeugung (Kap. 5.2).
// Lädt die Auftragspositionen inkl. Set-/Bundle-Komponenten (Kap. 5.1) für die
// Expansion der Fertigungsstückliste; legt PA + BomItems an und schaltet den Status.

import { prisma } from "@texma/db";
import type {
  BomItemInput,
  OrderForProduction,
  ProductionRepository,
  ProductionStatus,
} from "../modules/production/production.service.js";

// 8-h-Arbeitstag: Sollminuten der Veredelung → Durchlauftage (mind. 1), wie in der
// Rückwärtsterminierung (B9). Grobe Startwerte (K-09), später verfeinerbar.
const WORK_MINUTES_PER_DAY = 480;

export class PrismaProductionRepository implements ProductionRepository {
  async loadOrderForProduction(orderId: string): Promise<OrderForProduction | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, freigegeben: true, zugesagterLiefertermin: true,
        production: { select: { id: true, number: true } },
        lines: { orderBy: { position: "asc" }, select: { description: true, qty: true, variantId: true } },
      },
    });
    if (!o) return null;

    // OrderLine.variantId ist eine reine String-Spalte (keine Relation) → Set-/Bundle-Daten
    // separat batchen, um die Komponenten-Stückliste der Set-Varianten zu erhalten (Kap. 5.1).
    const variantIds = [...new Set(o.lines.map((l) => l.variantId).filter((x): x is string => !!x))];
    const variants = variantIds.length
      ? await prisma.variant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, isBundle: true, bundleComponents: { orderBy: { position: "asc" }, select: { description: true, qty: true, componentVariantId: true } } },
        })
      : [];
    const byId = new Map(variants.map((v) => [v.id, v]));

    // Veredelungs-Durchlaufzeiten als Lead-Stufen (Basis der Rückwärtsterminierung, Kap. 35.2).
    const times = await prisma.finishingTargetTime.findMany({ select: { kind: true, targetMinutes: true }, orderBy: { kind: "asc" } });
    const stages = times.map((t) => ({ label: t.kind, durationDays: Math.max(1, Math.ceil(t.targetMinutes / WORK_MINUTES_PER_DAY)) }));

    return {
      id: o.id, number: o.number, freigegeben: o.freigegeben, deliveryDate: o.zugesagterLiefertermin, stages,
      existingProductionId: o.production?.id ?? null,
      existingProductionNumber: o.production?.number ?? null,
      lines: o.lines.map((l) => {
        const v = l.variantId ? byId.get(l.variantId) : undefined;
        return {
          description: l.description, qty: l.qty, variantId: l.variantId,
          isBundle: v?.isBundle ?? false,
          components: (v?.bundleComponents ?? []).map((c) => ({ description: c.description, qty: c.qty, componentVariantId: c.componentVariantId })),
        };
      }),
    };
  }

  async createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; bomItems: BomItemInput[] }): Promise<{ id: string }> {
    return prisma.productionOrder.create({
      data: {
        number: input.number,
        orderId: input.orderId,
        dueDate: input.dueDate,
        bomItems: { create: input.bomItems.map((b) => ({ description: b.description, qty: b.qty, variantId: b.variantId ?? null })) },
      },
      select: { id: true },
    });
  }

  async setOrderInProduction(orderId: string): Promise<void> {
    // Nur aus frühen Status weiterschalten; spätere Status (versendet/storniert) nicht überschreiben.
    await prisma.order.updateMany({
      where: { id: orderId, status: { in: ["ANGELEGT", "IN_BEARBEITUNG"] } },
      data: { status: "IN_PRODUKTION" },
    });
  }

  async releaseOrder(orderId: string): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { freigegeben: true } });
  }

  async status(orderId: string): Promise<ProductionStatus | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { freigegeben: true, production: { select: { id: true, number: true } } },
    });
    if (!o) return null;
    return { freigegeben: o.freigegeben, productionId: o.production?.id ?? null, productionNumber: o.production?.number ?? null };
  }
}
