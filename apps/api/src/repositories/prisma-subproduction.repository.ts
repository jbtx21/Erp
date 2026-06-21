// Prisma-Implementierung des Fremdvergabe-Repositories (Produktionspfad, T-04).

import { prisma } from "@texma/db";
import type { SubProductionStatus } from "@texma/shared";
import type {
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
      status: s.status as SubProductionStatus,
      beistellungVersandtAm: s.beistellungVersandtAm,
      ruecklaufErhaltenAm: s.ruecklaufErhaltenAm,
      beistellMenge: s.beistellMenge,
      ruecklaufMenge: s.ruecklaufMenge,
      dueDate: s.dueDate,
      lohnCents: s.lohnCents,
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
      status: s.status as SubProductionStatus,
      beistellungVersandtAm: s.beistellungVersandtAm,
      ruecklaufErhaltenAm: s.ruecklaufErhaltenAm,
      beistellMenge: s.beistellMenge,
      ruecklaufMenge: s.ruecklaufMenge,
      dueDate: s.dueDate,
      lohnCents: s.lohnCents,
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
