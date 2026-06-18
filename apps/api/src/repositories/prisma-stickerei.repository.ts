// Prisma-Implementierung des Stickerei-Repositories (Produktionspfad, Kap. 5.4).

import { prisma } from "@texma/db";
import type { StickereiContext } from "@texma/shared";
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
}
