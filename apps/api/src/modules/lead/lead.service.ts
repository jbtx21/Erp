// Lead/Interessent (B15, Kap. 18.1). Leichter Prospect; Funnel über F2; Konvertierung
// erzeugt eine Company (Standard-Preisgruppe) und übernimmt E-Mail/Telefon als Kontakt.

import {
  assertLeadDiscardable,
  canConvertLead,
  leadStatusMachine,
  LeadError,
  type InquirySource,
  type LeadStatus,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface CreateLeadInput {
  name: string;
  quelle: InquirySource;
  firma?: string | null;
  webseite?: string | null;
  verantwortlicher?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
}

export interface LeadRow {
  id: string;
  name: string;
  firma: string | null;
  webseite: string | null;
  verantwortlicher: string | null;
  email: string | null;
  phone: string | null;
  quelle: InquirySource;
  status: LeadStatus;
  note: string | null;
  verworfenGrund: string | null;
  convertedCompanyId: string | null;
  createdAt: Date;
}

export interface LeadRepository {
  create(input: CreateLeadInput): Promise<{ id: string }>;
  list(): Promise<LeadRow[]>;
  load(id: string): Promise<{ status: LeadStatus; name: string; firma: string | null; email: string | null; phone: string | null } | null>;
  setStatus(id: string, status: LeadStatus): Promise<void>;
  discard(id: string, grund: string): Promise<void>;
  /**
   * Erzeugt Company (+ Kontakt) und verknüpft den Lead — atomar, nur aus QUALIFIZIERT.
   * Bei B2B-Leads ist `firma` der Firmenname der Company, `name` der Ansprechpartner.
   * `customerNumber` ist die sprechende Kundennummer (KD-JJJJ-NNNN); `email` wird auf
   * die Company übernommen (nicht nur auf den Kontakt), damit Belegversand sie findet.
   */
  convert(id: string, input: { name: string; firma: string | null; email: string | null; phone: string | null; customerNumber: string }): Promise<{ companyId: string }>;
}

export class LeadService {
  constructor(
    private readonly repo: LeadRepository,
    private readonly audit: AuditSink,
    private readonly numbering: NumberingService
  ) {}

  async create(input: CreateLeadInput): Promise<{ id: string }> {
    if (!input.name || input.name.trim().length === 0) {
      throw new LeadError("Name ist Pflicht.");
    }
    const { id } = await this.repo.create(input);
    await this.audit.append(
      buildEntry({ entity: "Lead", entityId: id, action: "CREATE", after: { name: input.name, quelle: input.quelle } })
    );
    return { id };
  }

  /** Alle Leads (neueste zuerst). */
  async list(): Promise<LeadRow[]> {
    return this.repo.list();
  }

  /** Funnel-Übergang (KONTAKTIERT/QUALIFIZIERT) mit F2-Prüfung. */
  async transition(id: string, to: LeadStatus): Promise<void> {
    const lead = await this.repo.load(id);
    if (!lead) throw new LeadError(`Lead ${id} nicht gefunden`);
    leadStatusMachine.assert(lead.status, to);
    await this.repo.setStatus(id, to);
    await this.audit.append(
      buildEntry({ entity: "Lead", entityId: id, action: "UPDATE", after: { status: to } })
    );
  }

  /** Konvertiert einen qualifizierten Lead in eine Company. */
  async convert(id: string): Promise<{ companyId: string }> {
    const lead = await this.repo.load(id);
    if (!lead) throw new LeadError(`Lead ${id} nicht gefunden`);
    if (!canConvertLead(lead.status)) {
      leadStatusMachine.assert(lead.status, "KONVERTIERT"); // wirft mit klarer Meldung
    }
    // Sprechende Kundennummer (KD-JJJJ-NNNN) wie bei der direkten Firmenanlage (B3),
    // damit aus Leads entstandene Kunden nicht ohne Nummer im Stamm landen.
    const customerNumber = await this.numbering.next("CUSTOMER");
    const { companyId } = await this.repo.convert(id, { name: lead.name, firma: lead.firma, email: lead.email, phone: lead.phone, customerNumber });
    await this.audit.append(
      buildEntry({ entity: "Lead", entityId: id, action: "UPDATE", after: { status: "KONVERTIERT", companyId, customerNumber } })
    );
    return { companyId };
  }

  async discard(id: string, grund: string): Promise<void> {
    const lead = await this.repo.load(id);
    if (!lead) throw new LeadError(`Lead ${id} nicht gefunden`);
    assertLeadDiscardable(lead.status, grund);
    await this.repo.discard(id, grund.trim());
    await this.audit.append(
      buildEntry({ entity: "Lead", entityId: id, action: "UPDATE", after: { status: "VERWORFEN", verworfenGrund: grund.trim() } })
    );
  }
}
