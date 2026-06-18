// In-Memory-Implementierung des 3-Way-Match-Repositories — für Tests/lokale Durchstiche.

import type {
  PoAggregate,
  ThreeWayMatchRepository,
} from "../modules/three-way-match/three-way-match.service.js";

interface Stored {
  po: PoAggregate | null;
  status?: "GEPRUEFT" | "GESPERRT";
}

export class InMemoryThreeWayMatchRepository implements ThreeWayMatchRepository {
  constructor(private readonly invoices: Record<string, Stored>) {}

  async poAggregateForInvoice(incomingInvoiceId: string): Promise<PoAggregate | null> {
    return this.invoices[incomingInvoiceId]?.po ?? null;
  }

  async setStatus(incomingInvoiceId: string, status: "GEPRUEFT" | "GESPERRT"): Promise<void> {
    const inv = this.invoices[incomingInvoiceId];
    if (inv) inv.status = status;
  }

  /** Test-Helfer: zuletzt gesetzter Status. */
  statusOf(id: string): string | undefined {
    return this.invoices[id]?.status;
  }
}
