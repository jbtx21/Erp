// Contact-Dynamic-Link (CRM-Muster): entkoppelt Personen von genau einer Firma. Eine
// Person kann zusätzlich mit beliebig vielen Parteien (Company/Lead/Supplier/…)
// verknüpft werden. Idempotent über (contactId, entity, entityId).

import { buildEntry, type AuditSink } from "@texma/audit";

export class ContactLinkError extends Error {}

const LINKABLE = ["Company", "Lead", "Supplier"] as const;
export type LinkableEntity = (typeof LINKABLE)[number];

export interface ContactLinkRow {
  id: string;
  contactId: string;
  entity: string;
  entityId: string;
  role: string | null;
}

export interface PartyContact {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** true = Stammfirma (Contact.companyId), false = zusätzlicher Dynamic-Link. */
  primary: boolean;
  role: string | null;
}

/** Stammdaten einer Person (Anlage/Bearbeitung in der Kundenmaske). */
export interface ContactFields {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}

export interface ContactLinkRepository {
  contactExists(contactId: string): Promise<boolean>;
  create(input: { contactId: string; entity: string; entityId: string; role: string | null }): Promise<{ id: string; created: boolean }>;
  delete(id: string): Promise<void>;
  linksForContact(contactId: string): Promise<ContactLinkRow[]>;
  /** Alle Personen einer Partei: Stammkontakte (companyId) + Dynamic-Links. */
  contactsForEntity(entity: string, entityId: string): Promise<PartyContact[]>;
  /** Legt eine Person als Stammkontakt einer Firma an (Contact.companyId). */
  createContact(input: { companyId: string } & ContactFields): Promise<{ id: string }>;
  /** Aktualisiert die Stammdaten einer Person; gesetzte Felder werden überschrieben. */
  updateContact(id: string, fields: Partial<ContactFields>): Promise<void>;
  /** Löscht eine Person samt ihrer Dynamic-Links (nur Stammkontakte ohne Belegbezug). */
  deleteContact(id: string): Promise<void>;
  /** Stammfirma einer Person (für den Löschschutz: nur eigene Stammkontakte). */
  contactCompanyId(id: string): Promise<string | null>;
}

export class ContactLinkService {
  constructor(private readonly repo: ContactLinkRepository, private readonly audit: AuditSink) {}

  async link(contactId: string, entity: string, entityId: string, role?: string | null): Promise<{ id: string; created: boolean }> {
    if (!(LINKABLE as readonly string[]).includes(entity)) throw new ContactLinkError(`Verknüpfung mit „${entity}" wird nicht unterstützt.`);
    if (!entityId.trim()) throw new ContactLinkError("Ziel-ID ist Pflicht.");
    if (!(await this.repo.contactExists(contactId))) throw new ContactLinkError("Unbekannter Kontakt.");
    const res = await this.repo.create({ contactId, entity, entityId, role: role?.trim() || null });
    if (res.created) {
      await this.audit.append(buildEntry({ entity: "ContactLink", entityId: res.id, action: "CREATE", after: { contactId, target: `${entity}/${entityId}`, role: role ?? null } }));
    }
    return res;
  }

  async unlink(id: string): Promise<void> {
    await this.repo.delete(id);
    await this.audit.append(buildEntry({ entity: "ContactLink", entityId: id, action: "UPDATE", after: { removed: true } }));
  }

  linksForContact(contactId: string): Promise<ContactLinkRow[]> {
    return this.repo.linksForContact(contactId);
  }

  contactsForEntity(entity: string, entityId: string): Promise<PartyContact[]> {
    return this.repo.contactsForEntity(entity, entityId);
  }

  /** Person direkt in der Kundenmaske anlegen (Stammkontakt der Firma). */
  async createForCompany(companyId: string, fields: ContactFields): Promise<{ id: string }> {
    if (!companyId.trim()) throw new ContactLinkError("Firma ist Pflicht.");
    const first = fields.firstName.trim();
    const last = fields.lastName.trim();
    if (!first && !last) throw new ContactLinkError("Vor- oder Nachname ist Pflicht.");
    const res = await this.repo.createContact({
      companyId,
      firstName: first,
      lastName: last,
      email: fields.email?.trim() || null,
      phone: fields.phone?.trim() || null,
      role: fields.role?.trim() || null,
    });
    await this.audit.append(buildEntry({ entity: "Contact", entityId: res.id, action: "CREATE", after: { companyId, name: `${first} ${last}`.trim(), role: fields.role ?? null } }));
    return res;
  }

  /** Stammdaten einer Person bearbeiten (gesetzte Felder werden überschrieben). */
  async updateContact(id: string, fields: Partial<ContactFields>): Promise<void> {
    const trim = (v: string | null | undefined): string | null | undefined => (v === undefined ? undefined : v?.trim() || null);
    const patch: Partial<ContactFields> = {};
    if (fields.firstName !== undefined) patch.firstName = fields.firstName.trim();
    if (fields.lastName !== undefined) patch.lastName = fields.lastName.trim();
    if (fields.email !== undefined) patch.email = trim(fields.email);
    if (fields.phone !== undefined) patch.phone = trim(fields.phone);
    if (fields.role !== undefined) patch.role = trim(fields.role);
    await this.repo.updateContact(id, patch);
    await this.audit.append(buildEntry({ entity: "Contact", entityId: id, action: "UPDATE", after: patch }));
  }

  /** Person löschen — nur eigene Stammkontakte der Firma (Fehleingaben/Dubletten). */
  async deleteContactForCompany(id: string, companyId: string): Promise<void> {
    const owner = await this.repo.contactCompanyId(id);
    if (owner === null) throw new ContactLinkError("Unbekannter Kontakt.");
    if (owner !== companyId) throw new ContactLinkError("Diese Person ist Stammkontakt einer anderen Firma und kann hier nur entkoppelt werden.");
    await this.repo.deleteContact(id);
    await this.audit.append(buildEntry({ entity: "Contact", entityId: id, action: "UPDATE", after: { deleted: true } }));
  }
}
