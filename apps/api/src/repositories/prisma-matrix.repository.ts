// Prisma-Implementierung der Matrixprodukt-Grundtabelle (Farb-/Größen-Stamm + Größenläufe).

import { prisma } from "@texma/db";
import type {
  AxisValuePatch, AxisValueRow, CreateAxisValueInput, MatrixRepository, SizeRunRow, VariantAxis,
} from "../modules/matrix/matrix.service.js";

export class PrismaMatrixRepository implements MatrixRepository {
  async listAxisValues(axis?: VariantAxis, includeInactive = false): Promise<AxisValueRow[]> {
    const rows = await prisma.axisValue.findMany({
      where: { ...(axis ? { axis } : {}), ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ axis: "asc" }, { sortOrder: "asc" }, { value: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, axis: r.axis as VariantAxis, value: r.value, skuSuffix: r.skuSuffix, hex: r.hex, sortOrder: r.sortOrder, active: r.active }));
  }
  async createAxisValue(input: CreateAxisValueInput): Promise<{ id: string }> {
    return prisma.axisValue.create({
      data: { axis: input.axis, value: input.value, skuSuffix: input.skuSuffix ?? null, hex: input.hex ?? null, sortOrder: input.sortOrder ?? 0 },
      select: { id: true },
    });
  }
  async updateAxisValue(id: string, patch: AxisValuePatch): Promise<AxisValueRow | null> {
    const r = await prisma.axisValue.update({
      where: { id },
      data: {
        ...(patch.value !== undefined ? { value: patch.value } : {}),
        ...(patch.skuSuffix !== undefined ? { skuSuffix: patch.skuSuffix } : {}),
        ...(patch.hex !== undefined ? { hex: patch.hex } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    return { id: r.id, axis: r.axis as VariantAxis, value: r.value, skuSuffix: r.skuSuffix, hex: r.hex, sortOrder: r.sortOrder, active: r.active };
  }
  async listSizeRuns(): Promise<SizeRunRow[]> {
    const rows = await prisma.sizeRun.findMany({ orderBy: { name: "asc" } });
    return rows.map((r) => ({ id: r.id, name: r.name, values: r.values }));
  }
  async saveSizeRun(name: string, values: string[]): Promise<{ id: string }> {
    return prisma.sizeRun.upsert({ where: { name }, update: { values }, create: { name, values }, select: { id: true } });
  }
  async deleteSizeRun(id: string): Promise<void> {
    await prisma.sizeRun.deleteMany({ where: { id } });
  }
}
