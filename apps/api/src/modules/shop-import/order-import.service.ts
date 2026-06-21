// Anwendungsfall: WooCommerce-Bestellung in einen ERP-Auftrag importieren.
// Bindet Mapping (Kap. 3/T-01), Persistenz und GoBD-Audit (Kap. 10) zusammen.
// Repository als Interface → testbar ohne DB; in Produktion Prisma-Implementierung.

import { mapWooOrder, type ShopConnectorConfig, type MappedOrder } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CreatedOrder {
  id: string;
  number: string;
  companyId: string;
}

export interface OrderRepository {
  /** Idempotent: liefert bestehenden Auftrag, sonst legt neu an. */
  findByExternalNumber(
    shopConnectorId: string,
    externalNumber: string
  ): Promise<CreatedOrder | null>;
  createFromShop(mapped: MappedOrder): Promise<CreatedOrder>;
  /** Invariante (T-01): zählt Firmenkunden — darf durch Import NICHT wachsen. */
  countCompanies(): Promise<number>;
}

export interface ImportResult {
  order: CreatedOrder;
  created: boolean;
}

export class OrderImportService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly audit: AuditSink
  ) {}

  /**
   * Importiert eine rohe WooCommerce-Bestellung. Der Auftrag wird der Firma aus
   * der Connector-Config zugeordnet (T-01); Mitarbeiterkonten erzeugen keine Kunden.
   */
  async importWooOrder(
    raw: unknown,
    config: ShopConnectorConfig
  ): Promise<ImportResult> {
    const mapped = mapWooOrder(raw, config);

    const existing = await this.repo.findByExternalNumber(
      config.shopConnectorId,
      mapped.externalNumber
    );
    if (existing) {
      return { order: existing, created: false };
    }

    const order = await this.repo.createFromShop(mapped);

    await this.audit.append(
      buildEntry({
        entity: "Order",
        entityId: order.id,
        action: "CREATE",
        after: { source: "woocommerce", externalNumber: mapped.externalNumber },
      })
    );

    return { order, created: true };
  }
}
