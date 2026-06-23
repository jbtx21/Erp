// Auftrags-Workflow / Statusverwaltung: weist einem Auftrag die Produktionsroute zu
// (aus den Veredelungs-Merkmalen) und schaltet ihn Schritt für Schritt weiter. Die
// reine Routendefinition liegt in @texma/shared; hier die Zustandsfortschreibung +
// GoBD-Audit jedes Statuswechsels.

import { determineRoute, ORDER_ROUTES, routeProgress, type OrderRoute, type RouteProgress } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface WorkflowRepository {
  /** Merkmale zur Routenbestimmung: hat der Auftrag Veredelung, intern/extern? */
  orderFlags(orderId: string): Promise<{ exists: boolean; hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean }>;
  getRoute(orderId: string): Promise<{ route: OrderRoute | null; stepIndex: number } | null>;
  setRoute(orderId: string, route: OrderRoute, stepIndex: number): Promise<void>;
  setStepIndex(orderId: string, stepIndex: number): Promise<void>;
}

export class WorkflowError extends Error {}

export class WorkflowService {
  constructor(private readonly repo: WorkflowRepository, private readonly audit: AuditSink) {}

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

  /** Schaltet einen Schritt weiter; blockiert über das Ende hinaus. */
  async advance(orderId: string): Promise<RouteProgress> {
    const r = await this.repo.getRoute(orderId);
    if (!r || !r.route) throw new WorkflowError("Auftrag hat keine Route — erst zuweisen.");
    const total = ORDER_ROUTES[r.route].steps.length;
    if (r.stepIndex >= total) throw new WorkflowError("Workflow ist bereits abgeschlossen.");
    const completed = ORDER_ROUTES[r.route].steps[r.stepIndex];
    const next = r.stepIndex + 1;
    await this.repo.setStepIndex(orderId, next);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { stepCompleted: completed?.key, routeStepIndex: next } }));
    return routeProgress(r.route, next);
  }
}
