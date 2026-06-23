// Auftrags-Workflow / Statusverwaltung: weist einem Auftrag die Produktionsroute zu
// (aus den Veredelungs-Merkmalen) und schaltet ihn Schritt für Schritt weiter. Die
// reine Routendefinition liegt in @texma/shared; hier die Zustandsfortschreibung +
// GoBD-Audit jedes Statuswechsels.

import { determineRoute, ORDER_ROUTES, routeProgress, STEP_ACTION_LABEL, type OrderRoute, type RouteProgress } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

/** Proaktive Benachrichtigung, wenn ein automatisierbarer Schritt erreicht wird. */
export interface WorkflowNotifier {
  notify(recipient: string, title: string, body: string | null, navKey: string | null): Promise<unknown>;
}

export interface WorkflowRepository {
  /** Merkmale zur Routenbestimmung: hat der Auftrag Veredelung, intern/extern? */
  orderFlags(orderId: string): Promise<{ exists: boolean; hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean }>;
  getRoute(orderId: string): Promise<{ route: OrderRoute | null; stepIndex: number } | null>;
  setRoute(orderId: string, route: OrderRoute, stepIndex: number): Promise<void>;
  setStepIndex(orderId: string, stepIndex: number): Promise<void>;
}

export class WorkflowError extends Error {}

export class WorkflowService {
  constructor(
    private readonly repo: WorkflowRepository,
    private readonly audit: AuditSink,
    private readonly notifier?: WorkflowNotifier
  ) {}

  /** Weist die Route zu (aus Merkmalen oder explizit) und setzt den Auftrag auf Schritt 0. */
  async assignRoute(orderId: string, explicit?: OrderRoute): Promise<RouteProgress> {
    const flags = await this.repo.orderFlags(orderId);
    if (!flags.exists) throw new WorkflowError("Auftrag nicht gefunden.");
    const route = explicit ?? determineRoute(flags);
    await this.repo.setRoute(orderId, route, 0);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { route, routeStepIndex: 0 } }));
    return routeProgress(route, 0);
  }

  /** Aktueller Workflow-Status des Auftrags. */
  async status(orderId: string): Promise<RouteProgress | null> {
    const r = await this.repo.getRoute(orderId);
    if (!r || !r.route) return null;
    return routeProgress(r.route, r.stepIndex);
  }

  /**
   * Schaltet einen Schritt weiter; blockiert über das Ende hinaus. Erreicht der neue
   * aktuelle Schritt eine automatisierbare Aktion (Warenbestellvorschlag, Laufzettel,
   * AB+Druckfreigabe, QK-Bild), wird `recipient` proaktiv benachrichtigt.
   */
  async advance(orderId: string, recipient?: string): Promise<RouteProgress> {
    const r = await this.repo.getRoute(orderId);
    if (!r || !r.route) throw new WorkflowError("Auftrag hat keine Route — erst zuweisen.");
    const total = ORDER_ROUTES[r.route].steps.length;
    if (r.stepIndex >= total) throw new WorkflowError("Workflow ist bereits abgeschlossen.");
    const completed = ORDER_ROUTES[r.route].steps[r.stepIndex];
    const next = r.stepIndex + 1;
    await this.repo.setStepIndex(orderId, next);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { stepCompleted: completed?.key, routeStepIndex: next } }));

    const progress = routeProgress(r.route, next);
    const action = progress.currentStep?.action;
    if (action && this.notifier && recipient) {
      await this.notifier.notify(
        recipient,
        `Nächster Schritt: ${STEP_ACTION_LABEL[action]}`,
        `Auftrag ${orderId} hat „${progress.currentStep?.label}“ erreicht.`,
        "orders"
      );
    }
    return progress;
  }
}
