// Connections / Belegkette (ERPNext-Muster): liefert zu einem Auftrag den gesamten
// bidirektionalen Belegbaum — Vorgänger (Angebot/Lead) und Nachfolger (Lieferschein,
// Rechnung, Gutschrift, offener Posten/Zahlungen, Produktion, Reklamation) — gruppiert
// nach Prozessphase, jeweils mit Zähler. Reine Lese-Sicht (Nachvollziehbarkeit/Audit).

export interface ConnectionNode {
  entity: string; // z. B. "Quote", "Invoice", "DeliveryNote"
  id: string;
  label: string; // Belegnummer o. Ä.
  status?: string;
  /** Navigations-Schlüssel für die UI (welches Modul öffnen). */
  navKey?: string;
}

export interface ConnectionGroup {
  phase: string; // "Vertrieb" | "Fulfillment" | "Zahlung" | "Produktion" | "Reklamation"
  nodes: ConnectionNode[];
}

export interface OrderConnections {
  anchor: ConnectionNode; // der Auftrag selbst
  groups: ConnectionGroup[];
}

export interface ConnectionsRepository {
  orderConnections(orderId: string): Promise<OrderConnections | null>;
}

export class ConnectionsService {
  constructor(private readonly repo: ConnectionsRepository) {}

  /** Belegkette eines Auftrags (Vorgänger + Nachfolger, nach Phase gruppiert). */
  orderConnections(orderId: string): Promise<OrderConnections | null> {
    return this.repo.orderConnections(orderId);
  }
}
