// Anwendungsfall: Bank-Anbindung (Kap. 9) — Verbindungen verwalten (EBICS/PSD2),
// Kontoauszüge abrufen (AIS → bestehende Matching-Pipeline) und SEPA-Überweisungen
// auslösen (PIS, pain.001). Kapselt die Provider-Unterschiede über BankConnectionProvider
// und nutzt einen injizierten FinApiClient (Demo/Tests: In-Memory). Repository als Interface.

import { buildPain001, paymentOrderTotalCents, validateSepaPaymentOrder, type SepaCreditTransfer } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { BankingImportResult, BankingImportService } from "./banking-import.service.js";
import {
  providerFor,
  type BankConnectionInfo,
  type BankConnectionKind,
  type ConsentStatus,
  type FinApiClient,
} from "./bank-connection.provider.js";

export type PaymentOrderStatus = "DRAFT" | "SUBMITTED" | "EXECUTED" | "REJECTED";

export interface BankConnectionRow extends BankConnectionInfo {
  lastSyncAt: Date | null;
  createdAt: Date;
}

export interface CreateConnectionInput {
  name: string;
  kind: BankConnectionKind;
  iban: string;
  bic?: string | null;
  debtorName: string;
  /** PSD2: Ablauf der SCA-Zustimmung; bei Auslassung 90 Tage ab jetzt. */
  consentValidUntil?: Date | null;
}

export interface TransferRow {
  creditorName: string;
  creditorIban: string;
  creditorBic?: string | null;
  amountCents: number;
  remittance: string;
}

export interface PaymentOrderRow {
  id: string;
  connectionId: string;
  messageId: string;
  status: PaymentOrderStatus;
  totalCents: number;
  requestedExecutionDate: string;
  providerRef: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  transfers: TransferRow[];
}

export interface CreatePaymentOrderInput {
  connectionId: string;
  requestedExecutionDate: string;
  transfers: TransferRow[];
}

export interface PayableInvoice {
  id: string;
  number: string;
  supplierName: string;
  creditorIban: string | null;
  creditorBic: string | null;
  grossCents: number;
}

export interface BankConnectionRepository {
  listConnections(): Promise<BankConnectionRow[]>;
  getConnection(id: string): Promise<BankConnectionRow | null>;
  createConnection(input: CreateConnectionInput): Promise<BankConnectionRow>;
  deleteConnection(id: string): Promise<void>;
  updateLastSync(id: string, at: Date): Promise<void>;
  createPaymentOrder(input: {
    connectionId: string;
    messageId: string;
    totalCents: number;
    requestedExecutionDate: string;
    transfers: TransferRow[];
  }): Promise<PaymentOrderRow>;
  getPaymentOrder(id: string): Promise<PaymentOrderRow | null>;
  listPaymentOrders(): Promise<PaymentOrderRow[]>;
  updatePaymentOrderStatus(id: string, status: PaymentOrderStatus, providerRef: string | null, submittedAt: Date | null): Promise<PaymentOrderRow>;
  listPayableInvoices(): Promise<PayableInvoice[]>;
}

// ── UI-Sichten (Datumswerte als ISO-Strings für stabilen Transport) ──────────────
export interface BankConnectionView {
  id: string;
  name: string;
  kind: BankConnectionKind;
  iban: string;
  bic: string | null;
  debtorName: string;
  consent: Omit<ConsentStatus, "validUntil"> & { validUntil: string | null };
  lastSyncAt: string | null;
  createdAt: string;
}

export interface PaymentOrderView extends Omit<PaymentOrderRow, "submittedAt" | "createdAt"> {
  connectionName: string;
  submittedAt: string | null;
  createdAt: string;
}

const NINETY_DAYS_MS = 90 * 86_400_000;

export class BankConnectionService {
  constructor(
    private readonly repo: BankConnectionRepository,
    private readonly client: FinApiClient,
    private readonly bankingImport: BankingImportService,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  private toInfo(c: BankConnectionRow): BankConnectionInfo {
    return { id: c.id, name: c.name, kind: c.kind, iban: c.iban, bic: c.bic, debtorName: c.debtorName, consentValidUntil: c.consentValidUntil };
  }

  private toConnectionView(c: BankConnectionRow): BankConnectionView {
    const consent = providerFor(c.kind, this.client).consentStatus(this.toInfo(c), this.now());
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      iban: c.iban,
      bic: c.bic ?? null,
      debtorName: c.debtorName,
      consent: { ...consent, validUntil: consent.validUntil ? consent.validUntil.toISOString() : null },
      lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private toOrderView(o: PaymentOrderRow, connectionName: string): PaymentOrderView {
    return {
      id: o.id,
      connectionId: o.connectionId,
      messageId: o.messageId,
      status: o.status,
      totalCents: o.totalCents,
      requestedExecutionDate: o.requestedExecutionDate,
      providerRef: o.providerRef,
      transfers: o.transfers,
      connectionName,
      submittedAt: o.submittedAt ? o.submittedAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
    };
  }

  /** Alle Bank-Verbindungen inkl. Zustimmungs-/Verbindungsstatus. */
  async listConnections(): Promise<BankConnectionView[]> {
    return (await this.repo.listConnections()).map((c) => this.toConnectionView(c));
  }

  /** Legt eine Bank-Verbindung an (PSD2 ohne Datum → 90-Tage-Zustimmung ab jetzt). */
  async createConnection(input: CreateConnectionInput): Promise<BankConnectionView> {
    if (!input.name?.trim()) throw new Error("Bezeichnung ist erforderlich.");
    if (!input.iban?.trim()) throw new Error("IBAN ist erforderlich.");
    if (!input.debtorName?.trim()) throw new Error("Kontoinhaber ist erforderlich.");
    const consentValidUntil =
      input.kind === "PSD2"
        ? input.consentValidUntil ?? new Date(this.now().getTime() + NINETY_DAYS_MS)
        : null;
    const row = await this.repo.createConnection({ ...input, consentValidUntil });
    return this.toConnectionView(row);
  }

  /** Entfernt eine Bank-Verbindung (z. B. Testeintrag). */
  async deleteConnection(id: string): Promise<void> {
    await this.repo.deleteConnection(id);
  }

  /** Ruft neue Gutschriften der Verbindung ab und speist sie in die Matching-Pipeline. */
  async sync(connectionId: string): Promise<{ result: BankingImportResult; connection: BankConnectionView }> {
    const conn = await this.repo.getConnection(connectionId);
    if (!conn) throw new Error(`Bank-Verbindung ${connectionId} nicht gefunden.`);
    const provider = providerFor(conn.kind, this.client);
    const credits = await provider.fetchCredits(this.toInfo(conn), this.now());
    const result = await this.bankingImport.importCredits(credits, `bank:${conn.kind.toLowerCase()}`);
    const at = this.now();
    await this.repo.updateLastSync(conn.id, at);
    await this.audit.append(
      buildEntry({ entity: "BankConnection", entityId: conn.id, action: "UPDATE", after: { sync: result } })
    );
    return { result, connection: this.toConnectionView({ ...conn, lastSyncAt: at }) };
  }

  /** Offene Lieferantenrechnungen als Vorlage für Überweisungen (Prefill). */
  async listPayableInvoices(): Promise<PayableInvoice[]> {
    return this.repo.listPayableInvoices();
  }

  /** Erfasst einen SEPA-Überweisungsauftrag (Status DRAFT); validiert IBANs/Beträge. */
  async createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderView> {
    const conn = await this.repo.getConnection(input.connectionId);
    if (!conn) throw new Error(`Bank-Verbindung ${input.connectionId} nicht gefunden.`);
    const messageId = `PAY-${this.now().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // Validierung über die reine pain.001-Logik (wirft bei ungültigen IBANs/Beträgen).
    validateSepaPaymentOrder({
      messageId,
      debtorName: conn.debtorName,
      debtorIban: conn.iban,
      ...(conn.bic ? { debtorBic: conn.bic } : {}),
      requestedExecutionDate: input.requestedExecutionDate,
      transfers: input.transfers.map((t) => this.toSepaTransfer(t)),
    });
    const totalCents = input.transfers.reduce((s, t) => s + t.amountCents, 0);
    const row = await this.repo.createPaymentOrder({
      connectionId: conn.id,
      messageId,
      totalCents,
      requestedExecutionDate: input.requestedExecutionDate,
      transfers: input.transfers,
    });
    return this.toOrderView(row, conn.name);
  }

  /** Reicht einen DRAFT-Auftrag als pain.001 beim Bank-Provider ein (EBICS CCT / PSD2 PIS). */
  async submitPaymentOrder(orderId: string): Promise<PaymentOrderView> {
    const order = await this.repo.getPaymentOrder(orderId);
    if (!order) throw new Error(`Zahlungsauftrag ${orderId} nicht gefunden.`);
    if (order.status !== "DRAFT") throw new Error(`Auftrag ist nicht im Status DRAFT (ist ${order.status}).`);
    const conn = await this.repo.getConnection(order.connectionId);
    if (!conn) throw new Error(`Bank-Verbindung ${order.connectionId} nicht gefunden.`);

    const xml = buildPain001({
      messageId: order.messageId,
      debtorName: conn.debtorName,
      debtorIban: conn.iban,
      ...(conn.bic ? { debtorBic: conn.bic } : {}),
      requestedExecutionDate: order.requestedExecutionDate,
      createdAt: this.now(),
      transfers: order.transfers.map((t) => this.toSepaTransfer(t)),
    });

    const provider = providerFor(conn.kind, this.client);
    const submit = await provider.submitPayment(this.toInfo(conn), xml, this.now());
    const status: PaymentOrderStatus = submit.accepted ? "EXECUTED" : "REJECTED";
    const updated = await this.repo.updatePaymentOrderStatus(order.id, status, submit.providerRef, this.now());
    await this.audit.append(
      buildEntry({
        entity: "PaymentOrder",
        entityId: order.id,
        action: "UPDATE",
        after: { status, providerRef: submit.providerRef, totalCents: order.totalCents, kind: conn.kind },
      })
    );
    return this.toOrderView(updated, conn.name);
  }

  /** Alle Zahlungsaufträge (neueste zuerst), mit Verbindungsnamen. */
  async listPaymentOrders(): Promise<PaymentOrderView[]> {
    const [orders, conns] = await Promise.all([this.repo.listPaymentOrders(), this.repo.listConnections()]);
    const nameById = new Map(conns.map((c) => [c.id, c.name]));
    return orders.map((o) => this.toOrderView(o, nameById.get(o.connectionId) ?? o.connectionId));
  }

  private toSepaTransfer(t: TransferRow): SepaCreditTransfer {
    return {
      creditorName: t.creditorName,
      creditorIban: t.creditorIban,
      ...(t.creditorBic ? { creditorBic: t.creditorBic } : {}),
      amountCents: t.amountCents,
      remittance: t.remittance,
    };
  }
}

// Hilfs-Export, damit die UI die Gesamtsumme konsistent berechnen kann (reine Logik).
export { paymentOrderTotalCents };
