// Auftrags-Status-Workflow (B9, Kap. 35.2). Statusübergänge über die F2-Maschine
// (orderStatusMachine) — illegale Übergänge werden blockiert. Ändert nur den Status;
// inhaltliche Änderungen ab IN_BEARBEITUNG laufen über Storno/Neuanlage (GoBD).

import { orderStatusMachine, fulfillmentStatus, type FulfillmentStatus, type OrderStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

/** Eingaben zur Ableitung des Teil-Status (G-4). */
export interface FulfillmentInput {
  orderNetCents: number; // Auftragssumme (Soll)
  invoiceNetCents: number | null; // bereits berechnet (null = keine Rechnung)
  status: string; // OrderStatus (für Lieferstatus-Heuristik)
  hasDelivery: boolean; // existiert mind. ein Lieferschein?
}

export interface OrderWorkflowRepository {
  getStatus(orderId: string): Promise<string | null>;
  setStatus(orderId: string, status: string): Promise<void>;
  /** Setzt (oder löscht) den zugesagten Liefertermin (B9, Kap. 35.2). null = entfernen. */
  setDeliveryDate(orderId: string, date: Date | null): Promise<void>;
  /** Lädt die Eingaben zur Teil-Status-Ableitung (G-4); null = Auftrag fehlt. */
  loadFulfillmentInput(orderId: string): Promise<FulfillmentInput | null>;
  /** Persistiert Liefer-/Fakturastatus (G-4). */
  setFulfillment(orderId: string, lieferstatus: FulfillmentStatus, fakturastatus: FulfillmentStatus): Promise<void>;
}

// Lieferstatus-Heuristik (G-4): unser Modell hat keine Lieferzeilen-Mengen, daher aus
// Auftragsstatus + Lieferschein-Existenz abgeleitet (echte Mehrfach-Teillieferung bräuchte
// ein Lieferzeilen-Remodel — bewusst nicht G1-fremd aufgebläht).
const DELIVERED_STATUSES = new Set(["VERSENDET", "FAKTURIERT", "ABGESCHLOSSEN"]);
function deriveLieferstatus(status: string, hasDelivery: boolean): FulfillmentStatus {
  if (DELIVERED_STATUSES.has(status)) return "VOLL";
  return hasDelivery ? "TEILWEISE" : "NICHT";
}

export class OrderWorkflowError extends Error {}

export class OrderWorkflowService {
  constructor(
    private readonly repo: OrderWorkflowRepository,
    private readonly audit: AuditSink
  ) {}

  /** Schaltet einen Auftrag auf den nächsten Status (F2-geprüft). */
  async transition(orderId: string, to: OrderStatus): Promise<{ status: OrderStatus }> {
    const current = await this.repo.getStatus(orderId);
    if (!current) throw new OrderWorkflowError(`Auftrag ${orderId} nicht gefunden.`);
    orderStatusMachine.assert(current as OrderStatus, to); // wirft bei illegalem Übergang
    await this.repo.setStatus(orderId, to);
    await this.audit.append(
      buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { status: to, from: current } })
    );
    return { status: to };
  }

  /**
   * Setzt den zugesagten Liefertermin (B9, Kap. 35.2). Reine Termin-Zusage; die
   * Rückwärtsterminierung daraus erfolgt separat (scheduling.preview, ohne Persistenz).
   * GoBD: Terminänderung wird auditiert (kein stiller Überschreiber).
   */
  async setDeliveryDate(orderId: string, date: Date | null): Promise<{ zugesagterLiefertermin: Date | null }> {
    const current = await this.repo.getStatus(orderId);
    if (!current) throw new OrderWorkflowError(`Auftrag ${orderId} nicht gefunden.`);
    await this.repo.setDeliveryDate(orderId, date);
    await this.audit.append(
      buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { zugesagterLiefertermin: date } })
    );
    return { zugesagterLiefertermin: date };
  }

  /**
   * Berechnet Liefer-/Fakturastatus (G-4) neu: Fakturastatus aus Rechnungsbetrag vs.
   * Auftragssumme (echte Teil-Erkennung), Lieferstatus aus Status/Lieferschein-Heuristik.
   */
  async recomputeFulfillment(orderId: string): Promise<{ lieferstatus: FulfillmentStatus; fakturastatus: FulfillmentStatus }> {
    const inp = await this.repo.loadFulfillmentInput(orderId);
    if (!inp) throw new OrderWorkflowError(`Auftrag ${orderId} nicht gefunden.`);
    const fakturastatus = fulfillmentStatus(inp.orderNetCents, inp.invoiceNetCents ?? 0);
    const lieferstatus = deriveLieferstatus(inp.status, inp.hasDelivery);
    await this.repo.setFulfillment(orderId, lieferstatus, fakturastatus);
    await this.audit.append(
      buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { lieferstatus, fakturastatus } })
    );
    return { lieferstatus, fakturastatus };
  }
}
