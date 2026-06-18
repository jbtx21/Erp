// Lese-Schnittstelle für Aufträge (getrennt von der Schreib-/Import-Schnittstelle).
// Hält die tRPC-Read-Endpunkte unabhängig vom OrderImportService testbar.

export interface OrderListItem {
  id: string;
  number: string;
  companyId: string;
  externalNumber: string | null;
  employeeNote: string | null;
  createdAt: Date;
}

export interface OrderQueryRepository {
  listRecent(limit: number): Promise<OrderListItem[]>;
}
