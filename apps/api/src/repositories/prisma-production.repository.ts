// Prisma-Implementierung der Auftrag→Produktionsauftrag-Erzeugung (Kap. 5.2).
// Lädt die Auftragspositionen inkl. Set-/Bundle-Komponenten (Kap. 5.1) für die
// Expansion der Fertigungsstückliste; legt PA + BomItems an und schaltet den Status.

import { prisma } from "@texma/db";
import type {
  BomItemInput,
  OrderForProduction,
  ProductionRepository,
  ProductionStatus,
  SubOrderInput,
} from "../modules/production/production.service.js";

export class PrismaProductionRepository implements ProductionRepository {
  async loadOrderForProduction(orderId: string): Promise<OrderForProduction | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, freigegeben: true, zugesagterLiefertermin: true,
        production: { select: { id: true, number: true } },
        lines: { orderBy: { position: "asc" }, select: { position: true, description: true, qty: true, variantId: true, bezugPositionen: true } },
      },
    });
    if (!o) return null;

    // OrderLine.variantId ist eine reine String-Spalte (keine Relation) → Set-/Bundle-Daten
    // separat batchen, um die Komponenten-Stückliste der Set-Varianten zu erhalten (Kap. 5.1).
    const variantIds = [...new Set(o.lines.map((l) => l.variantId).filter((x): x is string => !!x))];
    const variants = variantIds.length
      ? await prisma.variant.findMany({
          where: { id: { in: variantIds } },
          select: {
            id: true, isBundle: true, articleId: true,
            article: { select: { veredlerId: true, bestandsgefuehrt: true, type: true } },
            bestandsgefuehrtOverride: true,
            // Hauptlieferant (niedrigste priority) für die Beschaffungs-Lieferzeit (Procure-to-Order).
            supplierItems: { orderBy: { priority: "asc" }, take: 1, select: { supplier: { select: { lieferzeitTage: true } } } },
            bundleComponents: { orderBy: { position: "asc" }, select: { description: true, qty: true, componentVariantId: true } },
          },
        })
      : [];
    const byId = new Map(variants.map((v) => [v.id, v]));

    // Beschaffungs-Lieferzeit (Procure-to-Order): längste Lieferzeit der Hauptlieferanten
    // über alle NICHT bestandsgeführten Positionen (bestandsgeführte sind bereits am Lager).
    let procurementLeadDays: number | null = null;
    for (const v of variants) {
      const managed = v.bestandsgefuehrtOverride ?? v.article.bestandsgefuehrt;
      if (managed) continue;
      const lt = v.supplierItems[0]?.supplier.lieferzeitTage ?? null;
      if (lt != null) procurementLeadDays = Math.max(procurementLeadDays ?? 0, lt);
    }

    return {
      id: o.id, number: o.number, freigegeben: o.freigegeben, deliveryDate: o.zugesagterLiefertermin,
      procurementLeadDays,
      existingProductionId: o.production?.id ?? null,
      existingProductionNumber: o.production?.number ?? null,
      lines: o.lines.map((l) => {
        const v = l.variantId ? byId.get(l.variantId) : undefined;
        return {
          position: l.position, description: l.description, qty: l.qty, variantId: l.variantId,
          articleId: v?.articleId ?? null,
          isBundle: v?.isBundle ?? false,
          components: (v?.bundleComponents ?? []).map((c) => ({ description: c.description, qty: c.qty, componentVariantId: c.componentVariantId })),
          veredlerId: v?.article.veredlerId ?? null,
          isVeredelung: v?.article.type === "FINISHING",
          bezugPositionen: l.bezugPositionen ?? [],
        };
      }),
    };
  }

  async createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; finishingProfile: string | null; bomItems: BomItemInput[]; subOrders: SubOrderInput[] }): Promise<{ id: string }> {
    return prisma.productionOrder.create({
      data: {
        number: input.number,
        orderId: input.orderId,
        dueDate: input.dueDate,
        finishingProfile: input.finishingProfile,
        bomItems: { create: input.bomItems.map((b) => ({ description: b.description, qty: b.qty, variantId: b.variantId ?? null })) },
        subOrders: { create: input.subOrders.map((s) => ({ number: s.number, sequence: s.sequence, inhouse: s.inhouse, ...(s.supplierId ? { supplier: { connect: { id: s.supplierId } } } : {}), beistellMenge: s.beistellMenge, beistellInfo: s.beistellInfo, beistellPositionen: s.beistellPositionen })) },
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

  async replaceBomItems(productionId: string, items: BomItemInput[]): Promise<void> {
    await prisma.$transaction([
      prisma.bomItem.deleteMany({ where: { productionId } }),
      prisma.bomItem.createMany({ data: items.map((b) => ({ productionId, description: b.description, qty: b.qty, variantId: b.variantId ?? null })) }),
    ]);
  }

  async approvalFacts(orderId: string): Promise<{ orderValueCents: number; discountPct: number } | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { lines: { select: { qty: true, unitNetCents: true, rabattPct: true } } },
    });
    if (!o) return null;
    const orderValueCents = o.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0);
    const discountPct = o.lines.reduce((m, l) => Math.max(m, l.rabattPct ?? 0), 0);
    return { orderValueCents, discountPct };
  }

  async status(orderId: string): Promise<ProductionStatus | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { freigegeben: true, production: { select: { id: true, number: true, finishingProfile: true, dueDate: true } } },
    });
    if (!o) return null;
    return {
      freigegeben: o.freigegeben,
      productionId: o.production?.id ?? null,
      productionNumber: o.production?.number ?? null,
      finishingProfile: (o.production?.finishingProfile ?? null) as ProductionStatus["finishingProfile"],
      dueDate: o.production?.dueDate ?? null,
    };
  }
}
