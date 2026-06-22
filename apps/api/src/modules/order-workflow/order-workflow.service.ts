// Auftrags-Status-Workflow (B9, Kap. 35.2). Statusübergänge über die F2-Maschine
// (orderStatusMachine) — illegale Übergänge werden blockiert. Ändert nur den Status;
// inhaltliche Änderungen ab IN_BEARBEITUNG laufen über Storno/Neuanlage (GoBD).

import { orderStatusMachine, type OrderStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface OrderWorkflowRepository {
  getStatus(orderId: string): Promise<string | null>;
  setStatus(orderId: string, status: string): Promise<void>;
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
}
