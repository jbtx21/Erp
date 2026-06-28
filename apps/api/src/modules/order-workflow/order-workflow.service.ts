// Auftrags-Status-Workflow (B9, Kap. 35.2). Statusübergänge über die F2-Maschine
// (orderStatusMachine) — illegale Übergänge werden blockiert. Ändert nur den Status;
// inhaltliche Änderungen ab IN_BEARBEITUNG laufen über Storno/Neuanlage (GoBD).

import { orderStatusMachine, fulfillmentStatus, checkApproval, type ApprovalThresholds, type FulfillmentStatus, type OrderStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

/** Eingaben zur Ableitung des Teil-Status (G-4). */
export interface FulfillmentInput {
  orderNetCents: number; // Auftragssumme (Soll)
  invoiceNetCents: number | null; // bereits berechnet (null = keine Rechnung)
  orderedQty: number; // Soll-Menge gesamt (Summe Auftragszeilen)
  deliveredQty: number; // gelieferte Menge gesamt (Summe Lieferzeilen, Mehrfach-Teillieferung)
}

export interface OrderWorkflowRepository {
  getStatus(orderId: string): Promise<string | null>;
  /** Sprechende Belegnummer (AB-…) für Benachrichtigungen/Audit; null = unbekannt. */
  getNumber(orderId: string): Promise<string | null>;
  /** Setzt das Fast-Lane-Kennzeichen (Eilauftrag-Priorisierung). */
  setFastLane(orderId: string, on: boolean): Promise<void>;
  setStatus(orderId: string, status: string): Promise<void>;
  /** Setzt (oder löscht) den zugesagten Liefertermin (B9, Kap. 35.2). null = entfernen. */
  setDeliveryDate(orderId: string, date: Date | null): Promise<void>;
  /** Lädt die Eingaben zur Teil-Status-Ableitung (G-4); null = Auftrag fehlt. */
  loadFulfillmentInput(orderId: string): Promise<FulfillmentInput | null>;
  /** Persistiert Liefer-/Fakturastatus (G-4). */
  setFulfillment(orderId: string, lieferstatus: FulfillmentStatus, fakturastatus: FulfillmentStatus): Promise<void>;
  /** Kennzahlen für das Freigabe-Gate (K-10): Auftragswert + höchster Positionsrabatt. */
  approvalFacts(orderId: string): Promise<{ orderValueCents: number; discountPct: number } | null>;
}

/** Optionen des Statuswechsels: GL-Freigabe-Gate gegen die Schwellen (K-10, Kap. 12.1). */
export interface TransitionOptions {
  /** Rolle des Auslösenden; nur ADMIN (Geschäftsleitung) darf über den Schwellen aktivieren. */
  role?: string;
  /** Freigabeschwellen (aus den Einstellungen); ohne Angabe greift kein Gate. */
  thresholds?: ApprovalThresholds;
}

const APPROVAL_REASON_TEXT: Record<string, string> = {
  RABATT_UEBER_SCHWELLE: "Rabatt über der Freigabegrenze",
  AUFTRAGSWERT_UEBER_SCHWELLE: "Auftragswert über der Freigabegrenze",
};

// Lieferstatus (G-4) jetzt REAL aus gelieferter vs. bestellter Menge (Mehrfach-Teillieferung).

export class OrderWorkflowError extends Error {}

export class OrderWorkflowService {
  constructor(
    private readonly repo: OrderWorkflowRepository,
    private readonly audit: AuditSink
  ) {}

  /** Schaltet einen Auftrag auf den nächsten Status (F2-geprüft). */
  async transition(orderId: string, to: OrderStatus, opts: TransitionOptions = {}): Promise<{ status: OrderStatus; number: string | null }> {
    const current = await this.repo.getStatus(orderId);
    if (!current) throw new OrderWorkflowError(`Auftrag ${orderId} nicht gefunden.`);
    orderStatusMachine.assert(current as OrderStatus, to); // wirft bei illegalem Übergang
    // Freigabe-Gate (K-10, Kap. 12.1): die verbindliche Auftragsaktivierung (→ IN_BEARBEITUNG)
    // ist der universelle Engpass — er greift auch für Handelsaufträge ohne Produktion (die nie
    // production.release durchlaufen). Über der Rabatt-/Wertgrenze nur durch die Geschäftsleitung.
    if (to === "IN_BEARBEITUNG" && opts.thresholds && opts.role !== "ADMIN") {
      const facts = await this.repo.approvalFacts(orderId);
      if (facts) {
        const chk = checkApproval(facts, opts.thresholds);
        if (chk.required) {
          const why = chk.reasons.map((r) => APPROVAL_REASON_TEXT[r] ?? r).join(", ");
          throw new OrderWorkflowError(`Freigabe nur durch die Geschäftsleitung (${why}).`);
        }
      }
    }
    await this.repo.setStatus(orderId, to);
    await this.audit.append(
      buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { status: to, from: current } })
    );
    return { status: to, number: await this.repo.getNumber(orderId) };
  }

  /** Setzt das Fast-Lane-Kennzeichen (Eilauftrag) und auditiert die Änderung. */
  async setFastLane(orderId: string, on: boolean): Promise<{ fastLane: boolean }> {
    const current = await this.repo.getStatus(orderId);
    if (!current) throw new OrderWorkflowError(`Auftrag ${orderId} nicht gefunden.`);
    await this.repo.setFastLane(orderId, on);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { fastLane: on } }));
    return { fastLane: on };
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
    const lieferstatus = fulfillmentStatus(inp.orderedQty, inp.deliveredQty);
    await this.repo.setFulfillment(orderId, lieferstatus, fakturastatus);
    await this.audit.append(
      buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { lieferstatus, fakturastatus } })
    );
    return { lieferstatus, fakturastatus };
  }
}
