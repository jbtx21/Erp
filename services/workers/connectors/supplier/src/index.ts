// Lieferanten-Connector (Worker-Tier) — Kap. 6, 5.6, 13, 32 (C3).
// Generischer Inbound-Connector: pollt den Lieferanten-Katalog (Delta-Sync), mappt
// ihn pro Connector-Art (Mapping in @texma/shared) und übergibt die kanonischen
// Items an den Import (apps/api suppliers.ingestCatalog). Ein Connector deckt alle
// Phase-1-Lieferanten ab — 10→30 Lieferanten ohne proportionalen Aufwand (Kap. 3.1).

import { mapSupplierCatalog, type SupplierCatalogItem, type SupplierKind } from "@texma/shared";

/** Gemeinsame Connector-Schnittstelle für alle externen Systeme (Kap. 32). */
export interface Connector<TConfig, TResult> {
  readonly kind: string;
  run(config: TConfig): Promise<TResult>;
}

/** Holt rohe Katalog-Items seit dem Delta-Cursor (REST). */
export interface SupplierCatalogClient {
  fetchCatalogSince(cursor: string | null): Promise<{ items: unknown[]; nextCursor: string }>;
}

/** Zusammenfassung eines Katalog-Imports (von apps/api zurückgegeben). */
export interface SupplierIngestSummary {
  upserted: number;
  skipped: number;
}

/** Übergabepunkt in die Anwendung (apps/api SupplierImportService). */
export interface SupplierIntake {
  ingestCatalog(supplierId: string, items: SupplierCatalogItem[]): Promise<SupplierIngestSummary>;
}

export interface SupplierConfig {
  supplierId: string;
  kind: SupplierKind;
  cursor: string | null;
}

export interface SupplierRunResult extends SupplierIngestSummary {
  nextCursor: string;
}

export class SupplierConnector
  implements Connector<SupplierConfig, SupplierRunResult>
{
  readonly kind = "supplier";

  constructor(
    private readonly client: SupplierCatalogClient,
    private readonly intake: SupplierIntake
  ) {}

  async run(config: SupplierConfig): Promise<SupplierRunResult> {
    const { items, nextCursor } = await this.client.fetchCatalogSince(config.cursor);
    const mapped = mapSupplierCatalog(items, config.kind);
    const summary = await this.intake.ingestCatalog(config.supplierId, mapped);
    return { ...summary, nextCursor };
  }
}

export {
  RestSupplierCatalogClient,
  type RestSupplierCatalogClientOptions,
  type SupplierAuth,
} from "./rest-client.js";
export { TrpcSupplierIntake } from "./trpc-intake.js";
export { runSupplierSync, type RunnerEnv, type SupplierRunSummary } from "./runner.js";
export { IdIdentityFeedClient, ID_IDENTITY_FEEDS, type IdIdentityFeedClientOptions } from "./id-identity-client.js";
export { StanleyStellaClient, type StanleyStellaClientOptions } from "./stanleystella-client.js";
