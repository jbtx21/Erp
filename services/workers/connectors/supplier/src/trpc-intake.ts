// Übergabe-Adapter: schiebt kanonische Katalog-Items per tRPC an apps/api
// (suppliers.ingestCatalog, C3). Der AppRouter-Typ kommt rein type-only.

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@texma/api";
import type { SupplierCatalogItem } from "@texma/shared";
import type { SupplierIngestOptions, SupplierIngestSummary, SupplierIntake } from "./index.js";

export class TrpcSupplierIntake implements SupplierIntake {
  private readonly client: ReturnType<typeof createTRPCClient<AppRouter>>;

  /** apiUrl z. B. http://localhost:3000/trpc. headers für die Session (rollen­geschützt). */
  constructor(apiUrl: string, headers?: Record<string, string>) {
    this.client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: apiUrl, headers: () => headers ?? {} })],
    });
  }

  async ingestCatalog(
    supplierId: string,
    items: SupplierCatalogItem[],
    opts?: SupplierIngestOptions
  ): Promise<SupplierIngestSummary> {
    return this.client.suppliers.ingestCatalog.mutate({ supplierId, items, createUnknown: opts?.createUnknown });
  }
}
