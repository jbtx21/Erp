// Lese-Schnittstelle für Aufträge (getrennt von der Schreib-/Import-Schnittstelle).
// Hält die tRPC-Read-Endpunkte unabhängig vom OrderImportService testbar.

export interface OrderListItem {
  id: string;
  number: string;
  companyId: string;
  externalNumber: string | null;
  employeeNote: string | null; // Kundendaten — für PRODUKTION redigiert (RBAC)
  totalNetCents: number | null; // Auftragswert — für PRODUKTION redigiert (RBAC)
  createdAt: Date;
}

export interface OrderQueryRepository {
  listRecent(limit: number): Promise<OrderListItem[]>;
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

export interface SupplierQueryRepository {
  listItems(supplierId: string, limit: number): Promise<SupplierItemListItem[]>;
}

// Eingangsrechnungen (C4). Finanzdaten → Endpunkt rollengeschützt (kein PRODUKTION).
export interface IncomingInvoiceListItem {
  id: string;
  supplierId: string;
  number: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  status: string;
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

export interface BankingQueryRepository {
  listClarifications(limit: number): Promise<BankingClarificationItem[]>;
}
