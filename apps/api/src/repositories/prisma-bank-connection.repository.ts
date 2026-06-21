// Prisma-Implementierung des Bank-Verbindungs-Repositories (Kap. 9).

import { prisma } from "@texma/db";
import type {
  BankConnectionRepository,
  BankConnectionRow,
  CreateConnectionInput,
  PayableInvoice,
  PaymentOrderRow,
  PaymentOrderStatus,
  TransferRow,
} from "../modules/banking/bank-connection.service.js";
import type { BankConnectionKind } from "../modules/banking/bank-connection.provider.js";

type PrismaOrder = {
  id: string;
  connectionId: string;
  messageId: string;
  status: string;
  totalCents: number;
  requestedExecutionDate: string;
  providerRef: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  transfers: { creditorName: string; creditorIban: string; creditorBic: string | null; amountCents: number; remittance: string }[];
};

function toOrderRow(o: PrismaOrder): PaymentOrderRow {
  return {
    id: o.id,
    connectionId: o.connectionId,
    messageId: o.messageId,
    status: o.status as PaymentOrderStatus,
    totalCents: o.totalCents,
    requestedExecutionDate: o.requestedExecutionDate,
    providerRef: o.providerRef,
    submittedAt: o.submittedAt,
    createdAt: o.createdAt,
    transfers: o.transfers.map((t) => ({
      creditorName: t.creditorName,
      creditorIban: t.creditorIban,
      creditorBic: t.creditorBic,
      amountCents: t.amountCents,
      remittance: t.remittance,
    })),
  };
}

export class PrismaBankConnectionRepository implements BankConnectionRepository {
  async listConnections(): Promise<BankConnectionRow[]> {
    const rows = await prisma.bankConnection.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((c) => ({ ...c, kind: c.kind as BankConnectionKind }));
  }

  async getConnection(id: string): Promise<BankConnectionRow | null> {
    const c = await prisma.bankConnection.findUnique({ where: { id } });
    return c ? { ...c, kind: c.kind as BankConnectionKind } : null;
  }

  async createConnection(input: CreateConnectionInput): Promise<BankConnectionRow> {
    const c = await prisma.bankConnection.create({
      data: {
        name: input.name,
        kind: input.kind,
        iban: input.iban,
        bic: input.bic ?? null,
        debtorName: input.debtorName,
        consentValidUntil: input.consentValidUntil ?? null,
      },
    });
    return { ...c, kind: c.kind as BankConnectionKind };
  }

  async updateLastSync(id: string, at: Date): Promise<void> {
    await prisma.bankConnection.update({ where: { id }, data: { lastSyncAt: at } });
  }

  async createPaymentOrder(input: {
    connectionId: string;
    messageId: string;
    totalCents: number;
    requestedExecutionDate: string;
    transfers: TransferRow[];
  }): Promise<PaymentOrderRow> {
    const o = await prisma.paymentOrder.create({
      data: {
        connectionId: input.connectionId,
        messageId: input.messageId,
        totalCents: input.totalCents,
        requestedExecutionDate: input.requestedExecutionDate,
        transfers: {
          create: input.transfers.map((t) => ({
            creditorName: t.creditorName,
            creditorIban: t.creditorIban,
            creditorBic: t.creditorBic ?? null,
            amountCents: t.amountCents,
            remittance: t.remittance,
          })),
        },
      },
      include: { transfers: true },
    });
    return toOrderRow(o);
  }

  async getPaymentOrder(id: string): Promise<PaymentOrderRow | null> {
    const o = await prisma.paymentOrder.findUnique({ where: { id }, include: { transfers: true } });
    return o ? toOrderRow(o) : null;
  }

  async listPaymentOrders(): Promise<PaymentOrderRow[]> {
    const rows = await prisma.paymentOrder.findMany({ include: { transfers: true }, orderBy: { createdAt: "desc" } });
    return rows.map(toOrderRow);
  }

  async updatePaymentOrderStatus(
    id: string,
    status: PaymentOrderStatus,
    providerRef: string | null,
    submittedAt: Date | null
  ): Promise<PaymentOrderRow> {
    const o = await prisma.paymentOrder.update({
      where: { id },
      data: { status, providerRef, submittedAt },
      include: { transfers: true },
    });
    return toOrderRow(o);
  }

  async listPayableInvoices(): Promise<PayableInvoice[]> {
    // „Zahlbar" = geprüfte (3-Way-Match ok), noch nicht bezahlte Eingangsrechnungen.
    const rows = await prisma.incomingInvoice.findMany({
      where: { status: "GEPRUEFT" },
      select: { id: true, number: true, grossCents: true, supplier: { select: { name: true, iban: true, bic: true } } },
      orderBy: { receivedAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      supplierName: r.supplier.name,
      creditorIban: r.supplier.iban,
      creditorBic: r.supplier.bic,
      grossCents: r.grossCents,
    }));
  }
}
