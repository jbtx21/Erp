// Anwendungsfall: eingehende E-Rechnung empfangen (Kap. 19/K-13, C4). Bindet das
// reine `receiveEInvoice` (parsen + EN16931-Validierung, @texma/shared) an Lieferanten-
// auflösung, Persistenz (`IncomingInvoice`) und GoBD-Audit. Ungültige Rechnungen oder
// unbekannte Lieferanten gehen NICHT in die DB, sondern in die Klärung (keine Phantom-
// Lieferanten). Idempotent über (supplierId, number). Repository als Interface → testbar.

import { receiveEInvoice } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CreateIncomingInvoiceInput {
  supplierId: string;
  number: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  issueDate: Date;
}

export interface IncomingInvoiceRepository {
  /** Löst den Lieferanten über USt-IdNr. (bevorzugt), sonst exakten Namen auf. */
  findSupplierByVatIdOrName(vatId: string | undefined, name: string): Promise<string | null>;
  findBySupplierAndNumber(supplierId: string, number: string): Promise<{ id: string } | null>;
  createIncomingInvoice(input: CreateIncomingInvoiceInput): Promise<{ id: string }>;
}

export type ClarificationReason = "VALIDIERUNG" | "LIEFERANT_UNBEKANNT";

export type ReceiveResult =
  | { status: "ERFASST"; incomingInvoiceId: string; supplierId: string; number: string; created: boolean }
  | { status: "KLAERUNG"; reason: ClarificationReason; details: string[] };

export class IncomingInvoiceService {
  constructor(
    private readonly repo: IncomingInvoiceRepository,
    private readonly audit: AuditSink
  ) {}

  /** Empfängt eine E-Rechnung (CII-XML): validieren → Lieferant auflösen → erfassen/klären. */
  async receive(xml: string): Promise<ReceiveResult> {
    const result = receiveEInvoice(xml);
    if (!result.draft) {
      return { status: "KLAERUNG", reason: "VALIDIERUNG", details: result.validation.errors };
    }

    const d = result.draft;
    const supplierId = await this.repo.findSupplierByVatIdOrName(d.supplierVatId, d.supplierName);
    if (!supplierId) {
      return {
        status: "KLAERUNG",
        reason: "LIEFERANT_UNBEKANNT",
        details: [d.supplierVatId ? `${d.supplierName} (${d.supplierVatId})` : d.supplierName],
      };
    }

    const existing = await this.repo.findBySupplierAndNumber(supplierId, d.number);
    if (existing) {
      return { status: "ERFASST", incomingInvoiceId: existing.id, supplierId, number: d.number, created: false };
    }

    const created = await this.repo.createIncomingInvoice({
      supplierId,
      number: d.number,
      netCents: d.netCents,
      taxCents: d.taxCents,
      grossCents: d.grossCents,
      issueDate: d.issueDate,
    });

    await this.audit.append(
      buildEntry({
        entity: "IncomingInvoice",
        entityId: created.id,
        action: "CREATE",
        after: { source: "einvoice.inbound", supplierId, number: d.number, grossCents: d.grossCents },
      })
    );

    return { status: "ERFASST", incomingInvoiceId: created.id, supplierId, number: d.number, created: true };
  }
}
