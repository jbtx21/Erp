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
  purchaseOrderId?: string | null;
  status?: "ERFASST" | "GEPRUEFT" | "GESPERRT";
}

export interface IncomingInvoiceRepository {
  /** Löst den Lieferanten über USt-IdNr. (bevorzugt), sonst exakten Namen auf. */
  findSupplierByVatIdOrName(vatId: string | undefined, name: string): Promise<string | null>;
  findBySupplierAndNumber(supplierId: string, number: string): Promise<{ id: string } | null>;
  createIncomingInvoice(input: CreateIncomingInvoiceInput): Promise<{ id: string }>;
  /** Genau eine offene Bestellung des Lieferanten (für Auto-Match); null bei 0 oder >1. */
  findSoleOpenPoForSupplier(supplierId: string): Promise<{ id: string; expectedNetCents: number } | null>;
}

export type ClarificationReason = "VALIDIERUNG" | "LIEFERANT_UNBEKANNT";

export type ReceiveResult =
  | { status: "ERFASST" | "GEPRUEFT" | "GESPERRT"; incomingInvoiceId: string; supplierId: string; number: string; created: boolean; matched: boolean }
  | { status: "KLAERUNG"; reason: ClarificationReason; details: string[] };

// Auto-Match-Toleranz (Kap. 9.6): 2 % Nettoabweichung als Grundband. LOW_FLOOR = 5 ct
// gegen Cent-Rundungsrauschen bei Kleinstbestellungen (KEIN Prozent-Aufschlag mehr — der
// frühere 100-ct-Untergrund war bei 10-€-POs faktisch 10 % Toleranz, IIN-001). CAP = 50.000 ct
// (500 €) deckelt die absolute Bandbreite bei Großbestellungen; darüber geht die Rechnung
// bewusst in die manuelle Prüfung (GESPERRT) statt automatisch durchzulaufen.
const AUTO_MATCH_NET_TOLERANCE_PCT = 0.02;
const AUTO_MATCH_LOW_FLOOR_CENTS = 5;
const AUTO_MATCH_CAP_CENTS = 50_000;

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
      return { status: "ERFASST", incomingInvoiceId: existing.id, supplierId, number: d.number, created: false, matched: false };
    }

    // 3-Way-Match-Auto-Trigger (Kap. 9.6): genau eine offene Bestellung des Lieferanten →
    // automatischer Betragsabgleich (Netto). Innerhalb Toleranz (2 %, min. 5 ct, max. 500 €) →
    // GEPRUEFT, sonst GESPERRT (Sachbearbeiter prüft). Keine/mehrere offene POs → ERFASST (manuell).
    const po = await this.repo.findSoleOpenPoForSupplier(supplierId);
    let status: "ERFASST" | "GEPRUEFT" | "GESPERRT" = "ERFASST";
    let purchaseOrderId: string | null = null;
    if (po) {
      purchaseOrderId = po.id;
      const tol = Math.min(
        Math.max(Math.round(po.expectedNetCents * AUTO_MATCH_NET_TOLERANCE_PCT), AUTO_MATCH_LOW_FLOOR_CENTS),
        AUTO_MATCH_CAP_CENTS
      );
      status = Math.abs(d.netCents - po.expectedNetCents) <= tol ? "GEPRUEFT" : "GESPERRT";
    }

    const created = await this.repo.createIncomingInvoice({
      supplierId,
      number: d.number,
      netCents: d.netCents,
      taxCents: d.taxCents,
      grossCents: d.grossCents,
      issueDate: d.issueDate,
      purchaseOrderId,
      status,
    });

    await this.audit.append(
      buildEntry({
        entity: "IncomingInvoice",
        entityId: created.id,
        action: "CREATE",
        after: { source: "einvoice.inbound", supplierId, number: d.number, grossCents: d.grossCents, purchaseOrderId, status, autoMatched: po !== null },
      })
    );

    return { status, incomingInvoiceId: created.id, supplierId, number: d.number, created: true, matched: po !== null };
  }
}
