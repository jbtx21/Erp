// Anbindung an apps/api (shipments.listShippable / confirmShipped) per tRPC.
// Der AppRouter-Typ kommt rein type-only.

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@texma/api";
import type { ShipmentPort, ShippableOrderDTO } from "./index.js";

export class TrpcShipmentPort implements ShipmentPort {
  private readonly client: ReturnType<typeof createTRPCClient<AppRouter>>;

  /** apiUrl z. B. http://localhost:3000/trpc. headers für die rollen­geschützte Session. */
  constructor(apiUrl: string, headers?: Record<string, string>) {
    this.client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: apiUrl, headers: () => headers ?? {} })],
    });
  }

  async listShippable(): Promise<ShippableOrderDTO[]> {
    const orders = await this.client.shipments.listShippable.query();
    return orders.map((o) => ({
      id: o.id,
      number: o.number,
      recipient: o.recipient,
      weightGrams: o.weightGrams,
    }));
  }

  async confirmShipped(orderId: string, trackingNumber: string): Promise<unknown> {
    return this.client.shipments.confirmShipped.mutate({ orderId, trackingNumber });
  }
}
