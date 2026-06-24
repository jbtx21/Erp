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
}
