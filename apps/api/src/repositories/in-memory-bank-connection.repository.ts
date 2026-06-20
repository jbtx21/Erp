// In-Memory-Implementierung des Bank-Verbindungs-Repositories (Demo/Tests).

import type {
  BankConnectionRepository,
  BankConnectionRow,
  CreateConnectionInput,
  PayableInvoice,
  PaymentOrderRow,
  PaymentOrderStatus,
  TransferRow,
} from "../modules/banking/bank-connection.service.js";

export interface InMemoryBankSeed {
  connections?: BankConnectionRow[];
  payableInvoices?: PayableInvoice[];
}

export class InMemoryBankConnectionRepository implements BankConnectionRepository {
  private readonly connections: BankConnectionRow[];
  private readonly orders: PaymentOrderRow[] = [];
  private readonly payable: PayableInvoice[];
  private seq = 0;

  constructor(seed: InMemoryBankSeed = {}) {
    this.connections = (seed.connections ?? []).map((c) => ({ ...c }));
    this.payable = (seed.payableInvoices ?? []).map((p) => ({ ...p }));
  }

  async listConnections(): Promise<BankConnectionRow[]> {
    return this.connections.map((c) => ({ ...c }));
  }

  async getConnection(id: string): Promise<BankConnectionRow | null> {
    const c = this.connections.find((x) => x.id === id);
    return c ? { ...c } : null;
  }

  async createConnection(input: CreateConnectionInput): Promise<BankConnectionRow> {
    const row: BankConnectionRow = {
      id: `conn-${++this.seq}`,
      name: input.name,
      kind: input.kind,
      iban: input.iban,
      bic: input.bic ?? null,
      debtorName: input.debtorName,
      consentValidUntil: input.consentValidUntil ?? null,
      lastSyncAt: null,
      createdAt: new Date(),
    };
    this.connections.push(row);
    return { ...row };
  }

  async updateLastSync(id: string, at: Date): Promise<void> {
    const c = this.connections.find((x) => x.id === id);
    if (c) c.lastSyncAt = at;
  }

  async createPaymentOrder(input: {
    connectionId: string;
    messageId: string;
    totalCents: number;
    requestedExecutionDate: string;
    transfers: TransferRow[];
  }): Promise<PaymentOrderRow> {
    const row: PaymentOrderRow = {
      id: `order-${++this.seq}`,
      connectionId: input.connectionId,
      messageId: input.messageId,
      status: "DRAFT",
      totalCents: input.totalCents,
      requestedExecutionDate: input.requestedExecutionDate,
      providerRef: null,
      submittedAt: null,
      createdAt: new Date(),
      transfers: input.transfers.map((t) => ({ ...t })),
    };
    this.orders.push(row);
    return structuredClone(row);
  }

  async getPaymentOrder(id: string): Promise<PaymentOrderRow | null> {
    const o = this.orders.find((x) => x.id === id);
    return o ? structuredClone(o) : null;
  }

  async listPaymentOrders(): Promise<PaymentOrderRow[]> {
    return [...this.orders].reverse().map((o) => structuredClone(o));
  }

  async updatePaymentOrderStatus(
    id: string,
    status: PaymentOrderStatus,
    providerRef: string | null,
    submittedAt: Date | null
  ): Promise<PaymentOrderRow> {
    const o = this.orders.find((x) => x.id === id);
    if (!o) throw new Error(`Zahlungsauftrag ${id} nicht gefunden.`);
    o.status = status;
    o.providerRef = providerRef;
    o.submittedAt = submittedAt;
    return structuredClone(o);
  }

  async listPayableInvoices(): Promise<PayableInvoice[]> {
    return this.payable.map((p) => ({ ...p }));
  }
}
