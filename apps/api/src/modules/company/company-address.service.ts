// Lieferadressen je Firma (B3 / Xentral-Benchmark): mehrere benannte Lieferadressen
// pro Kunde, genau eine als Standard (Beleg-Vorbelegung). Reine Stammdaten, jede
// Mutation wird auditiert (GoBD). Die Rechnungsadresse bleibt am Company-Stammsatz
// (§ 14 UStG, Pflichtangabe auf der Rechnung).

import { buildEntry, type AuditSink } from "@texma/audit";

export interface AddressRow {
  id: string;
  label: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  isDefault: boolean;
}

export interface AddressFields {
  label: string;
  street: string;
  zip: string;
  city: string;
  country?: string;
}

export interface CompanyAddressRepository {
  list(companyId: string): Promise<AddressRow[]>;
  /** Legt eine Lieferadresse an; `makeDefault` markiert sie (und entmarkiert die übrigen) als Standard. */
  create(companyId: string, fields: Required<AddressFields>, makeDefault: boolean): Promise<{ id: string }>;
  update(id: string, fields: Partial<Required<AddressFields>>): Promise<void>;
  /** Stammfirma einer Adresse (Eigentümer-Prüfung); null, wenn unbekannt. */
  companyIdOf(id: string): Promise<string | null>;
  /** Anzahl Aufträge, die diese Lieferadresse referenzieren (Löschschutz). */
  orderCount(id: string): Promise<number>;
  delete(id: string): Promise<void>;
  /** Setzt genau eine Adresse als Standard (alle anderen der Firma zurück). */
  setDefault(companyId: string, id: string): Promise<void>;
}

export class CompanyAddressError extends Error {}

export class CompanyAddressService {
  constructor(private readonly repo: CompanyAddressRepository, private readonly audit: AuditSink) {}

  list(companyId: string): Promise<AddressRow[]> {
    return this.repo.list(companyId);
  }

  async create(companyId: string, fields: AddressFields): Promise<{ id: string }> {
    const norm = this.normalize(fields);
    // Erste Adresse einer Firma wird automatisch Standard (sonst hätte der Kunde keine Vorbelegung).
    const existing = await this.repo.list(companyId);
    const makeDefault = existing.length === 0;
    const res = await this.repo.create(companyId, norm, makeDefault);
    await this.audit.append(buildEntry({ entity: "DeliveryAddress", entityId: res.id, action: "CREATE", after: { companyId, ...norm, isDefault: makeDefault } }));
    return res;
  }

  async update(id: string, companyId: string, fields: Partial<AddressFields>): Promise<void> {
    await this.assertOwner(id, companyId);
    const patch: Partial<Required<AddressFields>> = {};
    for (const k of ["label", "street", "zip", "city", "country"] as const) {
      if (fields[k] !== undefined) {
        const v = String(fields[k]).trim();
        if (k !== "country" && !v) throw new CompanyAddressError(`${k} darf nicht leer sein.`);
        patch[k] = v || (k === "country" ? "DE" : v);
      }
    }
    await this.repo.update(id, patch);
    await this.audit.append(buildEntry({ entity: "DeliveryAddress", entityId: id, action: "UPDATE", after: patch }));
  }

  async setDefault(companyId: string, id: string): Promise<void> {
    await this.assertOwner(id, companyId);
    await this.repo.setDefault(companyId, id);
    await this.audit.append(buildEntry({ entity: "DeliveryAddress", entityId: id, action: "UPDATE", after: { isDefault: true } }));
  }

  async delete(id: string, companyId: string): Promise<void> {
    await this.assertOwner(id, companyId);
    // Löschschutz: an Aufträgen referenzierte Adressen bleiben erhalten (GoBD/Belegtreue).
    if ((await this.repo.orderCount(id)) > 0) throw new CompanyAddressError("Lieferadresse ist an Aufträgen hinterlegt und kann nicht gelöscht werden.");
    await this.repo.delete(id);
    await this.audit.append(buildEntry({ entity: "DeliveryAddress", entityId: id, action: "UPDATE", after: { deleted: true } }));
  }

  private normalize(fields: AddressFields): Required<AddressFields> {
    const label = fields.label.trim();
    const street = fields.street.trim();
    const zip = fields.zip.trim();
    const city = fields.city.trim();
    if (!label) throw new CompanyAddressError("Bezeichnung ist Pflicht.");
    if (!street || !zip || !city) throw new CompanyAddressError("Straße, PLZ und Ort sind Pflicht.");
    return { label, street, zip, city, country: fields.country?.trim() || "DE" };
  }

  private async assertOwner(id: string, companyId: string): Promise<void> {
    const owner = await this.repo.companyIdOf(id);
    if (owner === null) throw new CompanyAddressError("Unbekannte Lieferadresse.");
    if (owner !== companyId) throw new CompanyAddressError("Lieferadresse gehört zu einer anderen Firma.");
  }
}
