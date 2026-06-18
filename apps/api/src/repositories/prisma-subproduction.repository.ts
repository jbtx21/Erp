// Prisma-Implementierung des Fremdvergabe-Repositories (Produktionspfad, T-04).

import { prisma } from "@texma/db";
import type { SubProductionStage, SubProductionStatus } from "@texma/shared";
import type {
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
    };
  }

  async listStages(productionId: string): Promise<SubProductionStage[]> {
    const rows = await prisma.subProductionOrder.findMany({
      where: { productionId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((s) => ({
      sequence: s.sequence,
      supplierId: s.supplierId,
      status: s.status as SubProductionStatus,
      beistellungVersandtAm: s.beistellungVersandtAm,
      ruecklaufErhaltenAm: s.ruecklaufErhaltenAm,
    }));
  }

  async updateStage(
    subProductionId: string,
    data: Pick<SubProductionStage, "status" | "beistellungVersandtAm" | "ruecklaufErhaltenAm">
  ): Promise<void> {
    await prisma.subProductionOrder.update({
      where: { id: subProductionId },
      data: {
        status: data.status,
        beistellungVersandtAm: data.beistellungVersandtAm ?? null,
        ruecklaufErhaltenAm: data.ruecklaufErhaltenAm ?? null,
      },
    });
  }
}
