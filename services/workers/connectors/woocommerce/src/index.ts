// WooCommerce-Connector (Worker-Tier) — Kap. 3, 13, 32.
// Pollt Bestellungen, mappt sie (Kap. 3/T-01) und übergibt sie an den Import.
// Generisches Connector-Framework: Mapping/Retry/Delta-Sync/Logging wiederverwendbar,
// damit 10→30 Shops ohne proportionalen Aufwand skalieren (Kap. 3.1/21/32).

import { mapWooOrder, type MappedOrder, type ShopConnectorConfig } from "@texma/shared";

/** Gemeinsame Connector-Schnittstelle für alle externen Systeme (Kap. 32). */
export interface Connector<TConfig, TResult> {
  readonly kind: string;
  run(config: TConfig): Promise<TResult>;
}

/** Holt rohe Bestellungen seit dem Delta-Cursor (REST/Webhook). */
export interface WooClient {
  fetchOrdersSince(cursor: string | null): Promise<{ orders: unknown[]; nextCursor: string }>;
}

/** Übergabepunkt in die Anwendung (apps/api OrderImportService). */
export interface OrderIntake {
  importWooOrder(raw: unknown, config: ShopConnectorConfig): Promise<unknown>;
}

export interface WooConnectorConfig extends ShopConnectorConfig {
  cursor: string | null;
}

export interface WooRunResult {
  importedCount: number;
  nextCursor: string;
}

export class WooCommerceConnector
  implements Connector<WooConnectorConfig, WooRunResult>
{
  readonly kind = "woocommerce";

  constructor(
    private readonly client: WooClient,
    private readonly intake: OrderIntake
  ) {}

  async run(config: WooConnectorConfig): Promise<WooRunResult> {
    const { orders, nextCursor } = await this.client.fetchOrdersSince(config.cursor);
    let importedCount = 0;
    for (const raw of orders) {
      // T-01: jede Bestellung wird über die Connector-Config der Firma zugeordnet.
      await this.intake.importWooOrder(raw, {
        shopConnectorId: config.shopConnectorId,
        companyId: config.companyId,
      });
      importedCount++;
    }
    return { importedCount, nextCursor };
  }
}

/** Reiner Mapping-Re-Export für Tests/Wiederverwendung. */
export function mapOrder(raw: unknown, config: ShopConnectorConfig): MappedOrder {
  return mapWooOrder(raw, config);
}
