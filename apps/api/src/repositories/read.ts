// Lese-Schnittstelle für Aufträge (getrennt von der Schreib-/Import-Schnittstelle).
// Hält die tRPC-Read-Endpunkte unabhängig vom OrderImportService testbar.

export interface OrderListItem {
  id: string;
  number: string;
  companyId: string;
  companyName: string | null; // Klarname statt Kürzel; für PRODUKTION redigiert (RBAC)
  status: string; // OrderStatus (B9) — Workflow-Übergänge via F2
  lieferstatus: string; // Teil-Status (G-4): NICHT/TEILWEISE/VOLL
  fakturastatus: string; // Teil-Status (G-4): NICHT/TEILWEISE/VOLL
  zugesagterLiefertermin: Date | null; // zugesagter Liefertermin (B9, Kap. 35.2) — produktionsrelevant, nicht redigiert
  externalNumber: string | null;
  employeeNote: string | null; // Kundendaten — für PRODUKTION redigiert (RBAC)
  totalNetCents: number | null; // Auftragswert — für PRODUKTION redigiert (RBAC)
  fastLane: boolean; // Eilauftrag-Priorisierung (Xentral „Fast-Lane")
  /** Sendungsnummer + Carrier (T-06) — Basis des klickbaren Tracking-Links; operativ, nicht redigiert. */
  trackingNumber: string | null;
  carrier: string | null;
  /** Server-berechnete erlaubte Status-Übergänge (Single Source of Truth, OrderStatus-Maschine). */
  allowedTransitions: string[];
  createdAt: Date;
}

export interface OrderLineItem {
  id: string;
  position: number;
  description: string;
  qty: number;
  unitNetCents: number;
}

export interface OrderQueryRepository {
  listRecent(limit: number): Promise<OrderListItem[]>;
  /** Positionen eines Auftrags (für Auswahl, z. B. Reklamation je Zeile). */
  orderLines(orderId: string): Promise<OrderLineItem[]>;
  /** Aktueller Status (für Workflow-Übergang). */
  getStatus(orderId: string): Promise<string | null>;
  /** Setzt den Status (nach F2-Prüfung im Service). */
  setStatus(orderId: string, status: string): Promise<void>;
}

// Lieferanten-Artikel (C3). EK-Preise sind finanziell sensibel → Endpunkt rollen-
// geschützt (kein PRODUKTION-Zugriff, Kap. 12).
export interface SupplierItemListItem {
  id: string;
  supplierId: string;
  variantId: string;
  supplierSku: string | null;
  ekCents: number;
  availableQty: number | null;
  priority: number;
}

export interface SupplierListItem {
  id: string;
  name: string;
  vatId: string | null;
  iban: string | null;
  kind: string;
  active: boolean;
}

/** Vollständiges Artikelsortiment eines Lieferanten (lesbar: Artikel + Farbe/Größe + EK). */
export interface SupplierCatalogItem {
  id: string;
  sku: string;
  articleName: string;
  farbe: string | null;
  groesse: string | null;
  supplierSku: string | null;
  ekCents: number;
  availableQty: number | null;
}

/** Lieferanten-Stammdaten 360° (Paket 1): Adresse + Konditionen. */
export interface SupplierStammdaten {
  email: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  zahlungszielTage: number;
  skontoPercent: number | null;
  skontoDays: number | null;
  lieferzeitTage: number | null;
  notiz: string | null;
}

export interface SupplierContactRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export interface UpdateSupplierInput extends Partial<SupplierStammdaten> {
  id: string;
  name?: string;
  vatId?: string | null;
  iban?: string | null;
  bic?: string | null;
}

/** Lieferanten-Detail + Historie (Bestellungen, Eingangsrechnungen, Einkaufsvolumen). */
export interface SupplierOverview {
  supplier: SupplierListItem & SupplierStammdaten & { bic: string | null };
  itemCount: number;
  contacts: SupplierContactRow[];
  purchaseOrders: Array<{ id: string; number: string; status: string; createdAt: Date }>;
  incomingInvoices: Array<{ id: string; number: string; grossCents: number; status: string; receivedAt: Date }>;
  /** Einkaufsvolumen = Summe der Eingangsrechnungen (brutto). */
  purchaseVolumeCents: number;
}

export interface SupplierQueryRepository {
  listItems(supplierId: string, limit: number): Promise<SupplierItemListItem[]>;
  /** Gesamtes Artikelsortiment eines Lieferanten (alle Katalogartikel, lesbar aufbereitet). */
  catalogAll(supplierId: string): Promise<SupplierCatalogItem[]>;
  /** Alle Lieferanten-Stammsätze (B6). */
  listSuppliers(): Promise<SupplierListItem[]>;
  /** Legt einen Lieferanten an (manueller Stammsatz). */
  createSupplier(input: { name: string; email?: string | null; vatId?: string | null; iban?: string | null; bic?: string | null }): Promise<{ id: string }>;
  /** E-Mail des Veredlers einer Fremdvergabe-Stufe (Veredelungsauftrag-Versand); null = keine. */
  emailForSubProduction(subProductionId: string): Promise<string | null>;
  /** Aktualisiert Lieferanten-Stammdaten (Adresse/Konditionen). */
  updateSupplier(input: UpdateSupplierInput): Promise<void>;
  /** Lieferanten-Detail + Historie. */
  supplierOverview(supplierId: string): Promise<SupplierOverview | null>;
  addSupplierContact(input: { supplierId: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; role?: string | null }): Promise<{ id: string }>;
  /** Bearbeitet einen Lieferanten-Ansprechpartner (nur gesetzte Felder). */
  updateSupplierContact(id: string, fields: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null; role?: string | null }): Promise<void>;
  deleteSupplierContact(id: string): Promise<void>;
}

// Eingangsrechnungen (C4). Finanzdaten → Endpunkt rollengeschützt (kein PRODUKTION).
export interface IncomingInvoiceListItem {
  id: string;
  supplierId: string;
  supplierName: string;
  number: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  status: string;
  /** EK-Abgleich-Status (OFFEN/OK/ABWEICHUNG/PRUEFUNG). */
  ekCheckStatus: string;
  /** Nettofälligkeit + Skonto-Frist (Zahlungssteuerung). */
  dueDate: Date | null;
  skontoUntil: Date | null;
  receivedAt: Date;
}

export interface IncomingInvoiceQueryRepository {
  listRecent(limit: number): Promise<IncomingInvoiceListItem[]>;
}

// Banking-Klärungsliste (T-13): nicht (voll) zugeordnete Zahlungseingänge. Finanzdaten
// → rollengeschützt (kein PRODUKTION).
export interface BankingClarificationItem {
  id: string;
  externalRef: string | null;
  amountCents: number;
  reference: string | null;
  bookedAt: Date;
}

// Importierter Kontoauszug-Eintrag (CAMT.053/Provider): Zahlungseingang mit Herkunft +
// Abgleichstatus — die „statements"-Historie über alle importierten Bankzahlungen.
export interface BankingStatementEntry {
  id: string;
  externalRef: string | null;
  amountCents: number;
  reference: string | null;
  matched: boolean;
  source: string;
  bookedAt: Date;
}

export interface BankingQueryRepository {
  listClarifications(limit: number): Promise<BankingClarificationItem[]>;
  /** Importierte Kontoauszug-Eingänge (neueste zuerst) — Quelle + Abgleichstatus. */
  listStatementEntries(limit: number): Promise<BankingStatementEntry[]>;
}

// Mahnwesen-Übersicht (T-14): offene Posten mit Mahnstufe + Sperre.
export interface DunningOverviewItem {
  id: string;
  invoiceNumber: string;
  /** Kunde (für die Verknüpfung Offener Posten ↔ Debitor). */
  companyId: string;
  companyName: string;
  /** Abrechnungsdatum der Rechnung (Rechnungsdatum). */
  issuedAt: Date;
  /** Effektives Zahlungsziel in Tagen (dueDate − issuedAt) — so wie es die Rechnung trägt. */
  zahlungszielTage: number;
  /** Rechnungsbetrag (brutto) zur Einordnung des offenen Betrags. */
  grossCents: number;
  openCents: number;
  dueDate: Date;
  /** Tage über die Fälligkeit hinaus (≤0 = noch nicht fällig) — dieselbe Basis wie der Mahnlauf. */
  daysOverdue: number;
  dunningLevel: number;
  mahnsperre: boolean;
  /** Jüngster Mahnbeleg (DunningNotice) zum Posten — für PDF/Mail; null = noch keiner. */
  latestNoticeId: string | null;
}

export interface DunningQueryRepository {
  listDunning(limit: number): Promise<DunningOverviewItem[]>;
}
