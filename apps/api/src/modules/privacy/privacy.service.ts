// DSGVO Sperren/Anonymisieren (B12, Kap. 28). Sperre verhindert weitere Verarbeitung
// (Marker), Anonymisierung überschreibt die personenbezogenen Stammdaten einer Firma
// und ihrer Kontakte. Belege (Rechnungen/Gutschriften) bleiben unverändert (WORM/G2).

import { buildEntry, type AuditSink } from "@texma/audit";

export interface PrivacyRepository {
  /** Setzt die DSGVO-Sperre an Firma + Kontakten (idempotent). */
  block(companyId: string, at: Date): Promise<void>;
  /**
   * Überschreibt PII der Firma + Kontakte und setzt anonymisiertAm. Lässt Belege
   * (Invoice/CreditNote) unangetastet. Gibt die Zahl anonymisierter Kontakte zurück.
   */
  anonymize(companyId: string, at: Date): Promise<{ contactsAnonymized: boolean[] } | null>;
}

export class PrivacyService {
  constructor(
    private readonly repo: PrivacyRepository,
    private readonly audit: AuditSink
  ) {}

  async block(companyId: string, at: Date = new Date()): Promise<void> {
    await this.repo.block(companyId, at);
    await this.audit.append(
      buildEntry({ entity: "Company", entityId: companyId, action: "UPDATE", after: { gesperrtAm: at } })
    );
  }

  async anonymize(companyId: string, at: Date = new Date()): Promise<number> {
    const res = await this.repo.anonymize(companyId, at);
    if (!res) throw new Error(`Company ${companyId} nicht gefunden`);
    const count = res.contactsAnonymized.length;
    await this.audit.append(
      buildEntry({
        entity: "Company",
        entityId: companyId,
        action: "UPDATE",
        after: { anonymisiertAm: at, kontakteAnonymisiert: count, belegeUnveraendert: true },
      })
    );
    return count;
  }
}
