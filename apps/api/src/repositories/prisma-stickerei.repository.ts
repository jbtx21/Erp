// Prisma-Implementierung des Stickerei-Repositories (Produktionspfad, Kap. 5.4 / 4.4).

import { prisma } from "@texma/db";
import type { StickereiContext, StickereiStaffel } from "@texma/shared";
import type { StickereiRepository } from "../modules/stickerei/stickerei.service.js";

export class PrismaStickereiRepository implements StickereiRepository {
  async contextForCompany(companyId: string): Promise<StickereiContext | null> {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { stickereiPartnerId: true, hatStickdatei: true },
    });
    if (!c) return null;
    return { stickereiPartnerId: c.stickereiPartnerId, hatStickdatei: c.hatStickdatei };
  }

  async listStaffeln(logoVersionId: string): Promise<StickereiStaffel[]> {
    const rows = await prisma.stickereiStaffel.findMany({
      where: { logoVersionId },
      select: { minMenge: true, ekCents: true },
      orderBy: { minMenge: "asc" },
    });
    return rows.map((r) => ({ minMenge: r.minMenge, ekCents: r.ekCents }));
  }

  async replaceStaffeln(
    logoVersionId: string,
    staffeln: ReadonlyArray<StickereiStaffel>
  ): Promise<void> {
    // Set-Semantik in einer Transaktion: alte Staffeln des Logos weg, neue rein.
    await prisma.$transaction([
      prisma.stickereiStaffel.deleteMany({ where: { logoVersionId } }),
      prisma.stickereiStaffel.createMany({
        data: staffeln.map((s) => ({ logoVersionId, minMenge: s.minMenge, ekCents: s.ekCents })),
      }),
    ]);
  }
}
