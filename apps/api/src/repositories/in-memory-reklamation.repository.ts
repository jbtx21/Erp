// In-Memory-Implementierung des Reklamations-Repositories — für Tests/Durchstiche.

import type { ComplaintInput, CostBearer, FollowUpType } from "@texma/shared";
import type {
  ComplaintFollowUpData,
  ComplaintListItem,
  ReklamationRepository,
} from "../modules/reklamation/reklamation.service.js";

interface OrderContext {
  companyId: string;
  invoiceId: string | null;
}

export class InMemoryReklamationRepository implements ReklamationRepository {
  private readonly complaints: ComplaintListItem[] = [];
  private readonly orderByComplaint = new Map<string, string>();
  private readonly orderContext = new Map<string, OrderContext>();
  readonly creditNotes: Array<{ id: string; invoiceId: string; number: string; amountCents: number }> = [];
  readonly reproductions: Array<{ id: string; companyId: string; number: string; sourceOrderId: string; express: boolean }> = [];
  private seq = 0;

  /** Test-Helfer: Auftragskontext (Firma/Rechnung) für loadFollowUp setzen. */
  setOrderContext(orderId: string, ctx: OrderContext): void {
    this.orderContext.set(orderId, ctx);
  }

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

  async loadFollowUp(complaintId: string): Promise<ComplaintFollowUpData | null> {
    const c = this.complaints.find((x) => x.id === complaintId);
    const orderId = this.orderByComplaint.get(complaintId);
    if (!c || !orderId) return null;
    const ctx = this.orderContext.get(orderId) ?? { companyId: "", invoiceId: null };
    return {
      orderId,
      companyId: ctx.companyId,
      invoiceId: ctx.invoiceId,
      followUp: c.followUp as FollowUpType,
      costCents: c.costCents,
    };
  }

  async createCreditNote(input: { invoiceId: string; number: string; amountCents: number; reason: string }): Promise<{ id: string }> {
    const id = `cn_${++this.seq}`;
    this.creditNotes.push({ id, invoiceId: input.invoiceId, number: input.number, amountCents: input.amountCents });
    return { id };
  }

  async createReproductionOrder(input: { companyId: string; number: string; sourceOrderId: string; express: boolean }): Promise<{ id: string }> {
    const id = `ord_${++this.seq}`;
    this.reproductions.push({ id, ...input });
    return { id };
  }
}
