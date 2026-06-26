// In-Memory-Matrix-Grundtabelle für Tests/Dev.

import type {
  AxisValuePatch, AxisValueRow, CreateAxisValueInput, MatrixRepository, SizeRunRow, VariantAxis,
} from "../modules/matrix/matrix.service.js";

export class InMemoryMatrixRepository implements MatrixRepository {
  private readonly values: AxisValueRow[] = [];
  private readonly runs: SizeRunRow[] = [];
  private seq = 0;

  async listAxisValues(axis?: VariantAxis, includeInactive = false): Promise<AxisValueRow[]> {
    return this.values
      .filter((v) => (axis ? v.axis === axis : true) && (includeInactive || v.active))
      .sort((a, b) => a.axis.localeCompare(b.axis) || a.sortOrder - b.sortOrder || a.value.localeCompare(b.value))
      .map((v) => ({ ...v }));
  }
  async createAxisValue(input: CreateAxisValueInput): Promise<{ id: string }> {
    const id = `axv-${++this.seq}`;
    this.values.push({ id, axis: input.axis, value: input.value, skuSuffix: input.skuSuffix ?? null, hex: input.hex ?? null, sortOrder: input.sortOrder ?? 0, active: true });
    return { id };
  }
  async updateAxisValue(id: string, patch: AxisValuePatch): Promise<AxisValueRow | null> {
    const v = this.values.find((x) => x.id === id);
    if (!v) return null;
    if (patch.value !== undefined) v.value = patch.value;
    if (patch.skuSuffix !== undefined) v.skuSuffix = patch.skuSuffix;
    if (patch.hex !== undefined) v.hex = patch.hex;
    if (patch.sortOrder !== undefined) v.sortOrder = patch.sortOrder;
    if (patch.active !== undefined) v.active = patch.active;
    return { ...v };
  }
  async listSizeRuns(): Promise<SizeRunRow[]> {
    return this.runs.map((r) => ({ ...r, values: [...r.values] })).sort((a, b) => a.name.localeCompare(b.name));
  }
  async saveSizeRun(name: string, values: string[]): Promise<{ id: string }> {
    const existing = this.runs.find((r) => r.name === name);
    if (existing) { existing.values = values; return { id: existing.id }; }
    const id = `run-${++this.seq}`;
    this.runs.push({ id, name, values });
    return { id };
  }
  async deleteSizeRun(id: string): Promise<void> {
    const i = this.runs.findIndex((r) => r.id === id);
    if (i >= 0) this.runs.splice(i, 1);
  }
}
