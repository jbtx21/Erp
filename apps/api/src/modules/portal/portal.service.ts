// Kundenportal — API-Grundlage (B13, Kap. 36). READ-ONLY Auftragsstatus, STRIKT auf
// die Firma des angemeldeten Kunden gescoped. Bewusst nur status-/versandnahe Felder
// (kein interner Deckungsbeitrag/Kostenträger).
//
// HINWEIS: Die eigentliche UI und der separate Kunden-Auth-Scope (RBAC-Erweiterung)
// sind das erste UI-Item und werden separat geplant (außerhalb der API-first-
// Entscheidung). Hier liegt die datenseitige Grundlage inkl. Mandanten-Isolation.

export interface CustomerOrderView {
  number: string;
  status: string;
  zugesagterLiefertermin: Date | null;
  trackingNumber: string | null;
  createdAt: Date;
}

export interface PortalRepository {
  /** Aufträge GENAU einer Firma (Mandanten-Isolation), read-only Projektion. */
  ordersForCompany(companyId: string): Promise<CustomerOrderView[]>;
}

export class CustomerPortalService {
  constructor(private readonly repo: PortalRepository) {}

  /** Auftragsstatus der eigenen Firma (companyId stammt aus dem Kunden-Auth-Scope). */
  async myOrders(companyId: string): Promise<CustomerOrderView[]> {
    if (!companyId || companyId.trim().length === 0) {
      throw new Error("companyId (Kunden-Scope) erforderlich");
    }
    return this.repo.ordersForCompany(companyId);
  }
}
