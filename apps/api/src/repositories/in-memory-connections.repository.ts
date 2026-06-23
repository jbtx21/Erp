// In-Memory-Connections-Repo für Tests: liefert einen vorbereiteten Belegbaum.
import type { ConnectionsRepository, OrderConnections } from "../modules/connections/connections.service.js";

export class InMemoryConnectionsRepository implements ConnectionsRepository {
  constructor(private readonly graphs: Record<string, OrderConnections>) {}
  async orderConnections(orderId: string): Promise<OrderConnections | null> {
    return this.graphs[orderId] ?? null;
  }
}
