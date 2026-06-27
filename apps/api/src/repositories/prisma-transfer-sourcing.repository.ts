// Prisma-Datenquelle für den Transferdruck-Bezug: bestandsgeführte Transfer-Veredelungs-
// positionen eines Auftrags + Material-Lieferant/EK aus den Lieferantenstammdaten.

import { prisma } from "@texma/db";
import type { TransferNeedInput, TransferSourcingRepository } from "../modules/transfer-sourcing/transfer-sourcing.service.js";

export class PrismaTransferSourcingRepository implements TransferSourcingRepository {
  async transferNeedsForOrder(orderId: string): Promise<TransferNeedInput[]> {
    const lines = await prisma.orderLine.findMany({
      where: { orderId, kind: "VEREDELUNG", variantId: { not: null } },
      select: { qty: true, variantId: true },
    });
    const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => !!v))];
    if (variantIds.length === 0) return [];
    const variants = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true, sku: true, bestandsgefuehrtOverride: true,
        article: { select: { name: true, isVeredelung: true, bestandsgefuehrt: true } },
        supplierItems: { where: { priority: 1 }, select: { supplierId: true, ekCents: true }, take: 1 },
      },
    });
    const vmap = new Map(variants.map((v) => [v.id, v]));
    // Bedarf je Transfer-Variante summieren (mehrere Positionen je Variante möglich).
    const byVariant = new Map<string, TransferNeedInput>();
    for (const l of lines) {
      const v = l.variantId ? vmap.get(l.variantId) : undefined;
      if (!v || !v.article.isVeredelung) continue;
      // Nur bestandsgeführte Veredelungsartikel = Transferdrucke (Override ?? Artikel-Flag).
      const managed = v.bestandsgefuehrtOverride ?? v.article.bestandsgefuehrt;
      if (!managed) continue;
      const si = v.supplierItems[0];
      const existing = byVariant.get(v.id);
      if (existing) { existing.needed += l.qty; continue; }
      byVariant.set(v.id, {
        variantId: v.id, sku: v.sku, bezeichnung: v.article.name, needed: l.qty,
        materialSupplierId: si?.supplierId ?? null, ekCents: si?.ekCents ?? null,
      });
    }
    return [...byVariant.values()];
  }
}
