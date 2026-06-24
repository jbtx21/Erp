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

  async loadFollowUp(complaintId: string) {
    const c = await prisma.complaint.findUnique({
      where: { id: complaintId },
      select: {
        orderId: true,
        followUp: true,
        costCents: true,
        order: { select: { companyId: true, invoice: { select: { id: true } } } },
      },
    });
    if (!c) return null;
    return {
      orderId: c.orderId,
      companyId: c.order.companyId,
      invoiceId: c.order.invoice?.id ?? null,
      followUp: c.followUp as FollowUpType,
      costCents: c.costCents,
    };
  }

  async createCreditNote(input: { invoiceId: string; number: string; amountCents: number; reason: string }): Promise<{ id: string }> {
    return prisma.creditNote.create({
      data: { invoiceId: input.invoiceId, number: input.number, amountCents: input.amountCents, reason: input.reason },
      select: { id: true },
    });
  }

  async createReproductionOrder(input: { companyId: string; number: string; sourceOrderId: string; express: boolean }): Promise<{ id: string }> {
    // Nachproduktion reproduziert denselben Auftragsinhalt: Positionen des Ursprungs-
    // auftrags werden 1:1 übernommen (sonst entsteht ein 0-€-Geisterauftrag ohne
    // Positionen). Der Innendienst kann anschließend anpassen.
    const src = await prisma.order.findUnique({
      where: { id: input.sourceOrderId },
      select: { lines: { orderBy: { position: "asc" }, select: { position: true, description: true, qty: true, unitNetCents: true, listNetCents: true, rabattPct: true, dbCents: true, kind: true, variantId: true } } },
    });
    const lines = src?.lines ?? [];
    return prisma.order.create({
      data: {
        number: input.number,
        companyId: input.companyId,
        nachproduktionVonId: input.sourceOrderId,
        employeeNote: input.express ? "Express-Nachproduktion (Reklamation)" : "Nachproduktion (Reklamation)",
        lines: { create: lines.map((l, i) => ({
          position: l.position ?? i + 1, description: l.description, qty: l.qty,
          unitNetCents: l.unitNetCents, listNetCents: l.listNetCents, rabattPct: l.rabattPct,
          dbCents: l.dbCents, kind: l.kind, variantId: l.variantId,
        })) },
      },
      select: { id: true },
    });
  }
}
