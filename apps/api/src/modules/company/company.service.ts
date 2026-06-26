// Firmen/Kunden-Stammdaten (B3). Anlegen/Bearbeiten/Auflisten — reine Stammdaten,
// keine Buchung (G1). Sperren/Anonymisieren liegt im Privacy-Modul (DSGVO), hier nur
// die operativen Felder (Name, Branche, Zahlungsziel, Mahnsperre, Preisgruppe).

import type { PriceGroupKind } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface CompanyRow {
  id: string;
  customerNumber: string | null;
  name: string;
  branche: string | null;
  zahlungszielTage: number;
  mahnsperre: boolean;
  priceGroupKind: PriceGroupKind;
  gesperrt: boolean;
}

export interface CreateCompanyInput {
  name: string;
  branche?: string | null;
  zahlungszielTage?: number;
  priceGroupKind: PriceGroupKind;
}

/** Erweiterte Stammdaten (Rechnungsadresse, Steuer, Bank, Zahlungs-/Lieferbedingungen). */
export interface CompanyStammdaten {
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  vatId: string | null;
  taxNumber: string | null;
  /** Zentrale Steuerregel: INLAND | EU_B2B | DRITTLAND | KLEINUNTERNEHMER (Xentral-Benchmark). */
  taxRule: string | null;
  iban: string | null;
  bic: string | null;
  bankName: string | null;
  sepaMandateRef: string | null;
  sepaMandateDate: string | null;
  skontoPercent: number | null;
  skontoDays: number | null;
  paymentMethod: string | null;
  lieferbedingung: string | null;
  notiz: string | null;
  kreditlimitCents: number | null;
}

export interface UpdateCompanyInput extends Partial<CompanyStammdaten> {
  id: string;
  name?: string;
  branche?: string | null;
  zahlungszielTage?: number;
  mahnsperre?: boolean;
}

/** Kunden-Detail + Historie (klickbar im Kundenstamm). */
export interface CompanyOverview {
  company: CompanyRow & { fromLead: boolean } & CompanyStammdaten;
  contactsCount: number;
  orders: Array<{ id: string; number: string; status: string; createdAt: Date }>;
  quotes: Array<{ id: string; number: string; status: string; createdAt: Date }>;
  invoices: Array<{ id: string; number: string; grossCents: number; issuedAt: Date }>;
  sampleLoans: Array<{ id: string; status: string; ausgegebenAm: Date }>;
  openCents: number;
  /** Umsatz-/Aktivitätskennzahlen je Kunde (über alle finalisierten Rechnungen). */
  metrics: {
    revenueNetCents: number;
    revenueGrossCents: number;
    revenueYtdGrossCents: number;
    invoiceCount: number;
    orderCount: number;
    avgInvoiceGrossCents: number;
  };
}

export interface CompanyRepository {
  list(): Promise<CompanyRow[]>;
  create(input: Required<Pick<CreateCompanyInput, "name" | "priceGroupKind">> & CreateCompanyInput & { customerNumber: string }): Promise<{ id: string }>;
  update(input: UpdateCompanyInput): Promise<void>;
  overview(companyId: string): Promise<CompanyOverview | null>;
  /** Firma mit exakt diesem Namen (case-insensitive) — für die Dedup-Anlage (B3/P1-4). */
  findByName(name: string): Promise<{ id: string } | null>;
  /** Anzahl operativer Belege/Vorgänge (Aufträge/Angebote/Rechnungen/… ) — Löschschutz. */
  countDocuments(companyId: string): Promise<number>;
  /** Löscht eine unbenutzte Firma; weiche Verweise (Leads/Kontakte/Adressen) werden gelöst. */
  deleteEmpty(companyId: string): Promise<void>;
}

export class CompanyError extends Error {}

export class CompanyService {
  constructor(
    private readonly repo: CompanyRepository,
    private readonly audit: AuditSink,
    private readonly numbering: NumberingService
  ) {}

  async list(): Promise<CompanyRow[]> {
    return this.repo.list();
  }

  /** Kunden-Detail + Historie (Aufträge/Angebote/Rechnungen/Leihgut). */
  overview(companyId: string): Promise<CompanyOverview | null> {
    return this.repo.overview(companyId);
  }

  async create(input: CreateCompanyInput): Promise<{ id: string }> {
    const name = input.name?.trim() ?? "";
    if (name.length < 2) throw new CompanyError("Firmenname ist Pflicht (mindestens 2 Zeichen).");
    // Plausibilität: ein Firmenname muss Buchstaben/Ziffern enthalten — blockt reine
    // Platzhalter/Sonderzeichen ("...", "---", "!!!") als Stammdaten-Müll.
    if (!/[\p{L}\p{N}]/u.test(name)) throw new CompanyError("Firmenname muss Buchstaben oder Ziffern enthalten.");
    // Dedup (P1-4): kein zweiter Stammsatz für denselben Namen — verhindert ungeprüften
    // Freitext-Müll und doppelte Kunden. Bestehende Firma wird wiederverwendet.
    const existing = await this.repo.findByName(name);
    if (existing) return existing;
    // Sprechende Kundennummer (KD-JJJJ-NNNN) aus dem Nummernkreis (lückenlos, je Jahr).
    const customerNumber = await this.numbering.next("CUSTOMER");
    const res = await this.repo.create({ ...input, name, customerNumber });
    await this.audit.append(
      buildEntry({ entity: "Company", entityId: res.id, action: "CREATE", after: { customerNumber, name, priceGroupKind: input.priceGroupKind } })
    );
    return res;
  }

  /**
   * Löscht eine **unbenutzte** Firma (Fehleingaben/Test-Müll, P1-4). Hat die Firma operative
   * Belege (Aufträge/Angebote/Rechnungen/…), wird die Löschung verweigert — Stammdaten mit
   * Geschäftsvorfällen bleiben GoBD-relevant erhalten. Weiche Verweise (Leads/Kontakte/
   * Adressen) werden beim Löschen gelöst.
   */
  async deleteCompany(id: string): Promise<void> {
    const docs = await this.repo.countDocuments(id);
    if (docs > 0) throw new CompanyError("Kunde hat verknüpfte Vorgänge (Aufträge/Angebote/Rechnungen) und kann nicht gelöscht werden. Nur unbenutzte Stammsätze sind löschbar.");
    await this.repo.deleteEmpty(id);
    await this.audit.append(buildEntry({ entity: "Company", entityId: id, action: "STORNO", after: { deleted: true } }));
  }

  async update(input: UpdateCompanyInput): Promise<void> {
    if (input.name !== undefined && !input.name.trim()) throw new CompanyError("Name darf nicht leer sein.");
    await this.repo.update({ ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) });
    await this.audit.append(buildEntry({ entity: "Company", entityId: input.id, action: "UPDATE", after: { ...input } }));
  }
}
