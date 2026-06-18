// Prisma-Implementierung des Reklamations-Repositories (Produktionspfad, Kap. 20).

import { prisma } from "@texma/db";
import type { ComplaintCause, ComplaintInput, CostBearer, FollowUpType } from "@texma/shared";
import type {
  ComplaintListItem,
  ReklamationRepository,
} from "../modules/reklamation/reklamation.service.js";

export class PrismaReklamationRepository implements ReklamationRepository {
  async create(input: ComplaintInput & { costBearer: CostBearer }): Promise<{ id: string }> {
    const c = await prisma.complaint.create({
      data: {
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        cause: input.cause as ComplaintCause,
        followUp: input.followUp as FollowUpType,
        costCents: input.costCents,
        costBearer: input.costBearer,
      },
      select: { id: true },
    });
    return c;
  }

  async listByOrder(orderId: string, limit: number): Promise<ComplaintListItem[]> {
    return prisma.complaint.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderLineId: true,
        cause: true,
        followUp: true,
        costCents: true,
        costBearer: true,
        createdAt: true,
      },
    });
  }
}
