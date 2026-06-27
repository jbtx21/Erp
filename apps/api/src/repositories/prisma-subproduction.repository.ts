// Prisma-Implementierung des Fremdvergabe-Repositories (Produktionspfad, T-04).

import { prisma } from "@texma/db";
import type { SubProductionStatus } from "@texma/shared";
import type {
  OpenSubOrderRow,
  StageUpdate,
  StoredStage,
  SubProductionRepository,
} from "../modules/subproduction/subproduction.service.js";

export class PrismaSubProductionRepository implements SubProductionRepository {
  async getStage(subProductionId: string): Promise<StoredStage | null> {
    const s = await prisma.subProductionOrder.findUnique({ where: { id: subProductionId } });
    if (!s) return null;
    return {
      id: s.id,
      productionId: s.productionId,
      sequence: s.sequence,
      supplierId: s.supplierId,
      inhouse: s.inhouse,
      status: s.status as SubProductionStatus,
      beistellungVersandtAm: s.beistellungVersandtAm,
      ruecklaufErhaltenAm: s.ruecklaufErhaltenAm,
      beistellMenge: s.beistellMenge,
      ruecklaufMenge: s.ruecklaufMenge,
      dueDate: s.dueDate,
      lohnCents: s.lohnCents,
      beistellPositionen: s.beistellPositionen,
      beistellInfo: s.beistellInfo,
    };
  }

  async listStages(productionId: string): Promise<StoredStage[]> {
    const rows = await prisma.subProductionOrder.findMany({
      where: { productionId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((s) => ({
      id: s.id,
      productionId: s.productionId,
      sequence: s.sequence,
      supplierId: s.supplierId,
      inhouse: s.inhouse,
      status: s.status as SubProductionStatus,
      beistellungVersandtAm: s.beistellungVersandtAm,
      ruecklaufErhaltenAm: s.ruecklaufErhaltenAm,
      beistellMenge: s.beistellMenge,
      ruecklaufMenge: s.ruecklaufMenge,
      dueDate: s.dueDate,
      lohnCents: s.lohnCents,
      beistellPositionen: s.beistellPositionen,
      beistellInfo: s.beistellInfo,
    }));
  }

  async listOpenStages(): Promise<OpenSubOrderRow[]> {
    const rows = await prisma.subProductionOrder.findMany({
      where: { status: { not: "ABGESCHLOSSEN" } },
      orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
      select: {
        productionId: true, number: true, sequence: true, inhouse: true, status: true, dueDate: true,
        supplier: { select: { name: true } },
        production: { select: { number: true, orderId: true, order: { select: { number: true } } } },
      },
    });
    return rows.map((s) => ({
      productionId: s.productionId,
      productionNumber: s.production.number,
      orderId: s.production.orderId,
      orderNumber: s.production.order.number,
      subNumber: s.number,
      sequence: s.sequence,
      supplierName: s.supplier?.name ?? null,
      inhouse: s.inhouse,
      status: s.status as SubProductionStatus,
      dueDate: s.dueDate,
    }));
  }

  async updateStage(subProductionId: string, data: StageUpdate): Promise<void> {
    await prisma.subProductionOrder.update({
      where: { id: subProductionId },
      data: {
        status: data.status,
        beistellungVersandtAm: data.beistellungVersandtAm ?? null,
        ruecklaufErhaltenAm: data.ruecklaufErhaltenAm ?? null,
        beistellMenge: data.beistellMenge ?? null,
        ruecklaufMenge: data.ruecklaufMenge ?? null,
      },
    });
  }
}
