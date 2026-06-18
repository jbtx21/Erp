// In-Memory-Implementierung des Reklamations-Repositories — für Tests/Durchstiche.

import type { ComplaintInput, CostBearer } from "@texma/shared";
import type {
  ComplaintListItem,
  ReklamationRepository,
} from "../modules/reklamation/reklamation.service.js";

export class InMemoryReklamationRepository implements ReklamationRepository {
  private readonly complaints: ComplaintListItem[] = [];
  private readonly orderByComplaint = new Map<string, string>();
  private seq = 0;

  async create(input: ComplaintInput & { costBearer: CostBearer }): Promise<{ id: string }> {
    const id = `compl_${++this.seq}`;
    this.complaints.push({
      id,
      orderLineId: input.orderLineId,
      cause: input.cause,
      followUp: input.followUp,
      costCents: input.costCents,
      costBearer: input.costBearer,
      createdAt: new Date(),
    });
    this.orderByComplaint.set(id, input.orderId);
    return { id };
  }

  async listByOrder(orderId: string, limit: number): Promise<ComplaintListItem[]> {
    return this.complaints
      .filter((c) => this.orderByComplaint.get(c.id) === orderId)
      .slice(0, limit);
  }
}
