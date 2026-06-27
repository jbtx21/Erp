// Prisma-Implementierung des QS-Repositories (QS-Felder am Auftrag).

import { prisma } from "@texma/db";
import type { QualityCheck, QualityRepository, QualityStatus } from "../modules/quality/quality.service.js";

export class PrismaQualityRepository implements QualityRepository {
  async get(orderId: string): Promise<QualityCheck | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, qsStatus: true, qsStueckzahlOk: true, qsVeredelungOk: true, qsFotoOk: true, qsNotiz: true, qsGeprueftAm: true },
    });
    if (!o) return null;
    return {
      orderId: o.id, status: o.qsStatus as QualityStatus,
      stueckzahlOk: o.qsStueckzahlOk, veredelungOk: o.qsVeredelungOk, fotoOk: o.qsFotoOk,
      notiz: o.qsNotiz, geprueftAm: o.qsGeprueftAm,
    };
  }

  async update(orderId: string, data: { stueckzahlOk: boolean; veredelungOk: boolean; fotoOk: boolean; notiz: string | null; status: QualityStatus; geprueftAm: Date | null }): Promise<boolean> {
    const res = await prisma.order.updateMany({
      where: { id: orderId },
      data: { qsStueckzahlOk: data.stueckzahlOk, qsVeredelungOk: data.veredelungOk, qsFotoOk: data.fotoOk, qsNotiz: data.notiz, qsStatus: data.status, qsGeprueftAm: data.geprueftAm },
    });
    return res.count > 0;
  }
}
