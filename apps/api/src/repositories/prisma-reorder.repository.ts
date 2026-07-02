// Prisma-Implementierung des Reorder-Repositories (Produktionspfad, T-12).
// Unterschrittene Bestände: StockLevel mit minStock > 0 und qty < minStock (Spalten-
// vergleich in JS), je Variante der Hauptlieferant (SupplierItem priority 1). Aus dem
// gebündelten Vorschlag wird je Lieferant eine Bestellung (status BESTELLT) erzeugt.

import { prisma } from "@texma/db";
import type { DemandItem, DemandStock, DemandSupplier, ReorderCandidate, SupplierReorder } from "@texma/shared";
import type {
  CreatedReorderPo,
  ReorderRepository,
} from "../modules/reorder/reorder.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";

export class PrismaReorderRepository implements ReorderRepository {
  // Lückenlose Belegnummern (BE-JAHR-NNNN) statt roher Timestamp-Nummern (Bucket A / GoBD).
  constructor(private readonly numbering: NumberingService = new NumberingService(new PrismaNumberingRepository())) {}

  /** Offener Bedarf: variantenbezogene Positionen aus angelegten Aufträgen + aktiven Muster-Leihen. */
  async openDemand(): Promise<DemandItem[]> {
    const orderLines = await prisma.orderLine.findMany({
      where: { variantId: { not: null }, order: { status: { in: ["ANGELEGT", "IN_BEARBEITUNG", "IN_PRODUKTION", "VERSANDBEREIT"] } } },
      select: { variantId: true, qty: true, order: { select: { number: true } } },
    });
    const loanLines = await prisma.sampleLoanLine.findMany({
      where: { variantId: { not: null }, sampleLoan: { status: "VERLIEHEN" } },
      select: { variantId: true, menge: true, sampleLoanId: true },
    });
    return [
      ...orderLines.map((l) => ({ variantId: l.variantId as string, qty: l.qty, source: "ORDER" as const, ref: l.order.number })),
      ...loanLines.map((l) => ({ variantId: l.variantId as string, qty: l.menge, source: "LOAN" as const, ref: l.sampleLoanId })),
    ];
  }

  async stockLevels(): Promise<DemandStock[]> {
    const rows = await prisma.stockLevel.findMany({ select: { variantId: true, qty: true } });
    return rows.map((r) => ({ variantId: r.variantId, qty: r.qty }));
  }

  async variantSuppliers(): Promise<DemandSupplier[]> {
    const rows = await prisma.supplierItem.findMany({ where: { priority: 1 }, select: { variantId: true, supplierId: true, ekCents: true } });
    return rows.map((r) => ({ variantId: r.variantId, supplierId: r.supplierId, ekCents: r.ekCents }));
  }

  async variantMeta(variantIds: string[]): Promise<Map<string, import("../modules/reorder/reorder.service.js").VariantMeta>> {
    if (variantIds.length === 0) return new Map();
    const rows = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sku: true, article: { select: { name: true, brand: true } }, attributes: { select: { name: true, value: true } } },
    });
    return new Map(rows.map((v) => {
      const farbe = v.attributes.find((a) => a.name === "Farbe")?.value ?? null;
      const groesse = v.attributes.find((a) => a.name === "Größe")?.value ?? null;
      return [v.id, { sku: v.sku, articleName: v.article.name, brand: v.article.brand, farbe, groesse }];
    }));
  }

  async belowMinStock(): Promise<ReorderCandidate[]> {
    const stocks = await prisma.stockLevel.findMany({
      where: { minStock: { gt: 0 } },
      select: { variantId: true, qty: true, minStock: true },
    });
    const below = stocks.filter((s) => s.qty < s.minStock);
    if (below.length === 0) return [];

    const suppliers = await prisma.supplierItem.findMany({
      where: { variantId: { in: below.map((s) => s.variantId) }, priority: 1 },
      select: { variantId: true, supplierId: true, ekCents: true },
    });
    const byVariant = new Map(suppliers.map((si) => [si.variantId, si]));

    // Ohne Hauptlieferant kein automatischer Vorschlag (Klärung).
    return below.flatMap((s) => {
      const si = byVariant.get(s.variantId);
      return si
        ? [{ variantId: s.variantId, qty: s.qty, minStock: s.minStock, supplierId: si.supplierId, ekCents: si.ekCents }]
        : [];
    });
  }

  async createPurchaseOrders(groups: SupplierReorder[]): Promise<CreatedReorderPo[]> {
    // Belegnummern vorab lückenlos reservieren (BE-JAHR-NNNN) — sequenziell, kollisionsfrei.
    const numbers: string[] = [];
    for (const _g of groups) numbers.push(await this.numbering.next("PURCHASE_ORDER"));
    // Auftragsnummern der Bedarfsquellen (MTO) → Order-Ids für den PO ↔ Auftrag-Rückverweis.
    const orderRefs = [...new Set(groups.flatMap((g) => g.lines.flatMap((l) => (l.sources ?? []).filter((s) => s.source === "ORDER").map((s) => s.ref))))];
    const refOrders = orderRefs.length > 0
      ? await prisma.order.findMany({ where: { number: { in: orderRefs } }, select: { id: true, number: true } })
      : [];
    const orderIdByNumber = new Map(refOrders.map((o) => [o.number, o.id]));
    return prisma.$transaction(async (tx) => {
      const out: CreatedReorderPo[] = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]!;
        const po = await tx.purchaseOrder.create({
          data: {
            number: numbers[i]!,
            supplierId: g.supplierId,
            status: "BESTELLT",
            lines: { create: g.lines.map((l) => ({ variantId: l.variantId, qty: l.orderQty, ekCents: l.ekCents })) },
          },
          select: { id: true, number: true, supplier: { select: { name: true } }, lines: { select: { id: true, variantId: true } } },
        });
        // Bedarfsquellen je Position persistieren (nur MTO-Pfad; T-12 hat keine Quellen).
        const lineIdByVariant = new Map(po.lines.map((l) => [l.variantId, l.id]));
        const sourceRows = g.lines.flatMap((l) =>
          (l.sources ?? []).map((s) => ({
            purchaseOrderLineId: lineIdByVariant.get(l.variantId)!,
            orderId: s.source === "ORDER" ? orderIdByNumber.get(s.ref) ?? null : null,
            ref: s.ref,
            qty: s.qty,
          }))
        );
        if (sourceRows.length > 0) await tx.purchaseOrderLineSource.createMany({ data: sourceRows });
        out.push({ supplierId: g.supplierId, supplierName: po.supplier.name, purchaseOrderId: po.id, number: po.number, lineCount: g.lines.length });
      }
      return out;
    });
  }
}
