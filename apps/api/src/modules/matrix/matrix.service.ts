// Matrixprodukt-Grundtabelle (Xentral-Vorbild): globaler Farb-/Größen-Stamm ("Gruppe"
// = Achse, "Option" = Wert) + Größenlauf-Vorlagen. Wird vom Matrix-Editor am Artikel und
// (später) vom Lieferanten-Import als Achsen-Palette genutzt. GoBD-auditiert.

import { buildEntry, type AuditSink } from "@texma/audit";

export type VariantAxis = "FARBE" | "GROESSE";

export interface AxisValueRow {
  id: string;
  axis: VariantAxis;
  value: string;
  skuSuffix: string | null;
  hex: string | null;
  sortOrder: number;
  active: boolean;
}

export interface SizeRunRow {
  id: string;
  name: string;
  values: string[];
}

export interface CreateAxisValueInput {
  axis: VariantAxis;
  value: string;
  skuSuffix?: string | null;
  hex?: string | null;
  sortOrder?: number;
}

export interface AxisValuePatch {
  value?: string;
  skuSuffix?: string | null;
  hex?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface MatrixRepository {
  listAxisValues(axis?: VariantAxis, includeInactive?: boolean): Promise<AxisValueRow[]>;
  createAxisValue(input: CreateAxisValueInput): Promise<{ id: string }>;
  updateAxisValue(id: string, patch: AxisValuePatch): Promise<AxisValueRow | null>;
  listSizeRuns(): Promise<SizeRunRow[]>;
  saveSizeRun(name: string, values: string[]): Promise<{ id: string }>;
  deleteSizeRun(id: string): Promise<void>;
}

export class MatrixError extends Error {}

export class MatrixService {
  constructor(private readonly repo: MatrixRepository, private readonly audit: AuditSink) {}

  /** Achswerte ("Optionen") einer Gruppe (oder beide), sortiert; inaktive optional. */
  listAxisValues(axis?: VariantAxis, includeInactive = false): Promise<AxisValueRow[]> {
    return this.repo.listAxisValues(axis, includeInactive);
  }

  async createAxisValue(input: CreateAxisValueInput): Promise<{ id: string }> {
    if (!input.value?.trim()) throw new MatrixError("Wert ist Pflicht.");
    const res = await this.repo.createAxisValue({
      ...input, value: input.value.trim(),
      skuSuffix: input.skuSuffix?.trim() || null, hex: input.hex?.trim() || null,
    });
    await this.audit.append(buildEntry({ entity: "AxisValue", entityId: res.id, action: "CREATE", after: { axis: input.axis, value: input.value.trim() } }));
    return res;
  }

  async updateAxisValue(id: string, patch: AxisValuePatch): Promise<void> {
    if (patch.value !== undefined && !patch.value.trim()) throw new MatrixError("Wert darf nicht leer sein.");
    const clean: AxisValuePatch = { ...patch };
    if (clean.value !== undefined) clean.value = clean.value.trim();
    if (clean.skuSuffix !== undefined) clean.skuSuffix = clean.skuSuffix?.trim() || null;
    if (clean.hex !== undefined) clean.hex = clean.hex?.trim() || null;
    const before = (await this.repo.listAxisValues(undefined, true)).find((v) => v.id === id);
    const after = await this.repo.updateAxisValue(id, clean);
    if (!after) throw new MatrixError("Achswert nicht gefunden.");
    await this.audit.append(buildEntry({
      entity: "AxisValue", entityId: id, action: "UPDATE",
      before: before ? { value: before.value, skuSuffix: before.skuSuffix, sortOrder: before.sortOrder, active: before.active } : undefined,
      after: { value: after.value, skuSuffix: after.skuSuffix, sortOrder: after.sortOrder, active: after.active },
    }));
  }

  listSizeRuns(): Promise<SizeRunRow[]> {
    return this.repo.listSizeRuns();
  }

  async saveSizeRun(name: string, values: string[]): Promise<{ id: string }> {
    const n = name.trim();
    if (!n) throw new MatrixError("Name des Größenlaufs ist Pflicht.");
    const vals = values.map((v) => v.trim()).filter(Boolean);
    if (vals.length === 0) throw new MatrixError("Ein Größenlauf braucht mindestens eine Größe.");
    const res = await this.repo.saveSizeRun(n, vals);
    await this.audit.append(buildEntry({ entity: "SizeRun", entityId: res.id, action: "UPDATE", after: { name: n, values: vals } }));
    return res;
  }

  async deleteSizeRun(id: string): Promise<void> {
    await this.repo.deleteSizeRun(id);
    await this.audit.append(buildEntry({ entity: "SizeRun", entityId: id, action: "UPDATE", after: { deleted: true } }));
  }
}
