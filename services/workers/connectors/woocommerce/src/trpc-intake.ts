// Übergabe-Adapter: schiebt rohe WooCommerce-Bestellungen per tRPC an apps/api
// (shopOrders.ingest, T-01/Idempotenz). Der AppRouter-Typ kommt rein type-only.

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@texma/api";
import type { OrderIntake } from "./index.js";
import type { ShopConnectorConfig } from "@texma/shared";

export class TrpcOrderIntake implements OrderIntake {
  private readonly client: ReturnType<typeof createTRPCClient<AppRouter>>;

  /** apiUrl z. B. http://localhost:3000/trpc */
  constructor(apiUrl: string) {
    this.client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: apiUrl })],
    });
  }

  async importWooOrder(raw: unknown, config: ShopConnectorConfig, markInBearbeitung = false): Promise<unknown> {
    return this.client.shopOrders.ingest.mutate({
      raw,
      shopConnectorId: config.shopConnectorId,
      companyId: config.companyId,
      deliveryAddressPolicy: config.deliveryAddressPolicy,
      markInBearbeitung,
    });
  }
}
