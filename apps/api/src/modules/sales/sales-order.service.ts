// Auftragserstellung (Vertrieb): manueller Auftrag und Angebot→Auftrag-Umwandlung.
// Vervollständigt die Belegkette Anfrage→Angebot→Auftrag (Innendienst legt direkt an).
// Shop-Import (T-01) bleibt der zweite Auftragsweg; hier die manuelle Erfassung.

import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface SalesLine {
  description: string;
  qty: number;
  unitNetCents: number;
}

export interface CreatedSalesOrder {
  id: string;
  number: string;
}

export interface SalesOrderRepository {
  createOrder(input: { number: string; companyId: string; quoteId?: string; lines: SalesLine[] }): Promise<{ id: string }>;
  /** Angebotsdaten für die Umwandlung; null wenn unbekannt. */
  quoteForConversion(quoteId: string): Promise<{ companyId: string; existingOrderId: string | null; lines: SalesLine[] } | null>;
  markQuoteAccepted(quoteId: string): Promise<void>;
  companyExists(companyId: string): Promise<boolean>;
}

export class SalesOrderError extends Error {}

function validateLines(lines: SalesLine[]): void {
  if (lines.length === 0) throw new SalesOrderError("Mindestens eine Position erforderlich.");
  for (const l of lines) {
    if (!l.description.trim()) throw new SalesOrderError("Jede Position braucht eine Beschreibung.");
    if (l.qty <= 0) throw new SalesOrderError("Menge muss größer als 0 sein.");
    if (l.unitNetCents < 0) throw new SalesOrderError("Preis darf nicht negativ sein.");
  }
}

export class SalesOrderService {
  constructor(
    private readonly repo: SalesOrderRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  /** Manueller Auftrag (ohne Angebot). */
  async createManual(companyId: string, lines: SalesLine[]): Promise<CreatedSalesOrder> {
    if (!companyId.trim()) throw new SalesOrderError("Firma ist Pflicht.");
    validateLines(lines);
    if (!(await this.repo.companyExists(companyId))) throw new SalesOrderError("Unbekannte Firma.");
    const number = await this.numbering.next("ORDER");
    const { id } = await this.repo.createOrder({ number, companyId, lines });
    await this.audit.append(buildEntry({ entity: "Order", entityId: id, action: "CREATE", after: { number, companyId, lineCount: lines.length, manual: true } }));
    return { id, number };
  }

  /** Angebot → Auftrag: übernimmt Positionen, verknüpft das Angebot, setzt es auf angenommen. */
  async convertQuote(quoteId: string): Promise<CreatedSalesOrder> {
    const q = await this.repo.quoteForConversion(quoteId);
    if (!q) throw new SalesOrderError("Angebot nicht gefunden.");
    if (q.existingOrderId) throw new SalesOrderError("Angebot wurde bereits in einen Auftrag umgewandelt.");
    validateLines(q.lines);
    const number = await this.numbering.next("ORDER");
    const { id } = await this.repo.createOrder({ number, companyId: q.companyId, quoteId, lines: q.lines });
    await this.repo.markQuoteAccepted(quoteId);
    await this.audit.append(buildEntry({ entity: "Order", entityId: id, action: "CREATE", after: { number, fromQuote: quoteId, lineCount: q.lines.length } }));
    return { id, number };
  }
}
