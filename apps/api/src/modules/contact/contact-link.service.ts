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
  email: string | null;
  phone: string | null;
  /** true = Stammfirma (Contact.companyId), false = zusätzlicher Dynamic-Link. */
  primary: boolean;
  role: string | null;
}

export interface ContactLinkRepository {
  contactExists(contactId: string): Promise<boolean>;
  create(input: { contactId: string; entity: string; entityId: string; role: string | null }): Promise<{ id: string; created: boolean }>;
  delete(id: string): Promise<void>;
  linksForContact(contactId: string): Promise<ContactLinkRow[]>;
  /** Alle Personen einer Partei: Stammkontakte (companyId) + Dynamic-Links. */
  contactsForEntity(entity: string, entityId: string): Promise<PartyContact[]>;
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
}
