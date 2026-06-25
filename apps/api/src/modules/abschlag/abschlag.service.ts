// Abschlagsrechnung (Xentral): erzeugt aus einem Auftrag Teil-/Anzahlungsrechnungen
// (prozentual oder Festbetrag) mit eigenem Nummernkreis (AR-…), verfolgt den
// Zahlungseingang und liefert die Restsumme für die Schlussrechnung. Bindet die reine
// `computeAbschlag`/`abschlagSummary`-Logik an Persistenz + Nummernkreis + GoBD-Audit.

import { computeAbschlag, abschlagSummary, AbschlagError, type AbschlagSummary } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface OrderForAbschlag {
  id: string;
  number: string;
  companyId: string;
  /** Auftrags-Nettosumme (Soll). */
  orderNetCents: number;
  /** Effektiver USt-Satz in Prozent (zentral, Einstellungen). */
  taxRatePct: number;
  zahlungszielTage: number;
}

export interface AbschlagRecord {
  id: string;
  number: string;
  orderId: string;
  companyId: string;
  percent: number | null;
  netCents: number;
  taxCents: number;
  grossCents: number;
  dueDate: Date;
  bezahlt: boolean;
  note: string | null;
  issuedAt: Date;
}

export interface AbschlagRepository {
  loadOrderForAbschlag(orderId: string): Promise<OrderForAbschlag | null>;
  listForOrder(orderId: string): Promise<AbschlagRecord[]>;
  create(input: Omit<AbschlagRecord, "id" | "issuedAt" | "bezahlt">): Promise<AbschlagRecord>;
  setBezahlt(id: string, bezahlt: boolean): Promise<void>;
}

export interface OrderAbschlagView {
  order: { id: string; number: string; orderNetCents: number };
  abschlaege: AbschlagRecord[];
  summary: AbschlagSummary;
}

export class AbschlagService {
  constructor(
    private readonly repo: AbschlagRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Abschläge eines Auftrags + Restsumme zur Schlussrechnung. */
  async forOrder(orderId: string): Promise<OrderAbschlagView> {
    const order = await this.repo.loadOrderForAbschlag(orderId);
    if (!order) throw new AbschlagError("Auftrag nicht gefunden.");
    const abschlaege = await this.repo.listForOrder(orderId);
    return {
      order: { id: order.id, number: order.number, orderNetCents: order.orderNetCents },
      abschlaege,
      summary: abschlagSummary(order.orderNetCents, abschlaege),
    };
  }

  /** Legt eine Abschlagsrechnung an (percent ODER netCents). Über die Restsumme hinaus gesperrt. */
  async create(orderId: string, spec: { percent?: number; netCents?: number; note?: string }): Promise<AbschlagRecord> {
    const order = await this.repo.loadOrderForAbschlag(orderId);
    if (!order) throw new AbschlagError("Auftrag nicht gefunden.");
    const existing = await this.repo.listForOrder(orderId);
    const summary = abschlagSummary(order.orderNetCents, existing);

    const betrag = computeAbschlag(order.orderNetCents, order.taxRatePct, spec);
    if (betrag.netCents > summary.restNetCents) {
      throw new AbschlagError(`Abschlag (${betrag.netCents} ct netto) übersteigt die Restsumme (${summary.restNetCents} ct).`);
    }
    const number = await this.numbering.next("ABSCHLAG", this.now());
    const dueDate = new Date(this.now().getTime() + order.zahlungszielTage * 24 * 60 * 60 * 1000);
    const rec = await this.repo.create({
      number, orderId: order.id, companyId: order.companyId,
      percent: betrag.percent, netCents: betrag.netCents, taxCents: betrag.taxCents, grossCents: betrag.grossCents,
      dueDate, note: spec.note ?? null,
    });
    await this.audit.append(buildEntry({
      entity: "Abschlagsrechnung", entityId: rec.id, action: "FINALIZE",
      after: { number, fromOrder: order.number, netCents: betrag.netCents, grossCents: betrag.grossCents, percent: betrag.percent },
    }));
    return rec;
  }

  /** Markiert eine Abschlagsrechnung als bezahlt/offen (einfache OP-Verfolgung). */
  async setBezahlt(id: string, bezahlt: boolean): Promise<void> {
    await this.repo.setBezahlt(id, bezahlt);
    await this.audit.append(buildEntry({ entity: "Abschlagsrechnung", entityId: id, action: "UPDATE", after: { bezahlt } }));
  }
}
