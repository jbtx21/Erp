// Lager-/Warehouse-Stammdaten (Multi-Lager Stufe 1, Kap. 37): beliebige Läger statt
// festes Enum. Schlanke prisma-gestützte Verwaltung (Liste/Anlegen/Aktiv schalten);
// Bestände/Bewegungen wandern in Stufe 2 von der Enum- auf die Warehouse-Referenz.

import { prisma } from "@texma/db";
import { buildEntry, type AuditSink } from "@texma/audit";

export type WarehouseKind = "HAUPT" | "MUSTER" | "SHOWROOM" | "TRANSFERDRUCK" | "SONSTIGE";

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  kind: WarehouseKind;
  parentId: string | null;
  active: boolean;
}

const SELECT = { id: true, code: true, name: true, kind: true, parentId: true, active: true } as const;

export class WarehouseError extends Error {}

export class WarehouseService {
  constructor(private readonly audit: AuditSink) {}

  list(): Promise<WarehouseRow[]> {
    return prisma.warehouse.findMany({ orderBy: [{ active: "desc" }, { code: "asc" }], select: SELECT });
  }

  async create(input: { code: string; name?: string; kind?: WarehouseKind; parentId?: string | null }): Promise<WarehouseRow> {
    const code = input.code.trim().toUpperCase();
    if (!code) throw new WarehouseError("Lager-Code ist Pflicht.");
    if (await prisma.warehouse.findUnique({ where: { code } })) {
      throw new WarehouseError(`Lager-Code „${code}" existiert bereits.`);
    }
    const wh = await prisma.warehouse.create({
      data: { code, name: input.name?.trim() || code, kind: input.kind ?? "SONSTIGE", parentId: input.parentId ?? null },
      select: SELECT,
    });
    await this.audit.append(buildEntry({ entity: "Warehouse", entityId: wh.id, action: "CREATE", after: wh }));
    return wh;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await prisma.warehouse.update({ where: { id }, data: { active } });
    await this.audit.append(buildEntry({ entity: "Warehouse", entityId: id, action: "UPDATE", after: { active } }));
  }

  /** Bestand je Warehouse × Variante aus dem Bewegungs-Ledger (Multi-Lager 2b). */
  async balances(): Promise<Array<{ warehouseId: string; warehouseCode: string; warehouseName: string; variantId: string; sku: string; name: string; qty: number }>> {
    const grouped = await prisma.stockMove.groupBy({ by: ["warehouseId", "variantId"], where: { warehouseId: { not: null } }, _sum: { deltaQty: true } });
    const whIds = [...new Set(grouped.map((g) => g.warehouseId).filter((x): x is string => !!x))];
    const varIds = [...new Set(grouped.map((g) => g.variantId))];
    const [whs, vars] = await Promise.all([
      prisma.warehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, code: true, name: true } }),
      prisma.variant.findMany({ where: { id: { in: varIds } }, select: { id: true, sku: true, article: { select: { name: true } } } }),
    ]);
    const whMap = new Map(whs.map((w) => [w.id, w]));
    const varMap = new Map(vars.map((v) => [v.id, v]));
    return grouped
      .filter((g) => g.warehouseId && (g._sum.deltaQty ?? 0) !== 0)
      .map((g) => {
        const w = whMap.get(g.warehouseId!);
        const v = varMap.get(g.variantId);
        return {
          warehouseId: g.warehouseId!,
          warehouseCode: w?.code ?? g.warehouseId!,
          warehouseName: w?.name ?? "",
          variantId: g.variantId,
          sku: v?.sku ?? g.variantId,
          name: v?.article.name ?? "",
          qty: g._sum.deltaQty ?? 0,
        };
      })
      .sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.sku.localeCompare(b.sku));
  }
}
