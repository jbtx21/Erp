// Worker-Runner (run once) für den Lieferanten-Katalog-Poll (C3). Liest aktive
// Connector-Lieferanten via Prisma, baut je Connector-Art den REST-Client + tRPC-
// Intake, pollt den Katalog, schreibt den syncCursor zurück und protokolliert jeden
// Lauf im IntegrationLog (INBOUND/catalog.sync). Scheduler/Queue (BullMQ) = Block C2.

import { prisma } from "@texma/db";
import { decryptSecret, loadSecretsKey, type SupplierKind } from "@texma/shared";
import { PrismaIntegrationLogStore } from "@texma/worker-orchestration";
import { SupplierConnector } from "./index.js";
import { RestSupplierCatalogClient, type SupplierAuth } from "./rest-client.js";
import { TrpcSupplierIntake } from "./trpc-intake.js";

export interface RunnerEnv {
  apiUrl: string; // tRPC-Endpunkt von apps/api
  secretsKey: Buffer;
  /** Header für die rollen­geschützte Session (suppliers.ingestCatalog, Kap. 12). */
  apiHeaders?: Record<string, string>;
}

export interface SupplierRunSummary {
  supplierId: string;
  upserted: number;
  skipped: number;
  nextCursor: string;
}

// Endpunkt-/Auth-Profil je Connector-Art (vor Go-Live gegen die jeweilige API-Doku
// bestätigen). Nur Phase-1-Lieferanten mit Katalog-Inbound.
const CATALOG_PROFILES: Partial<
  Record<SupplierKind, { path: string; scheme: SupplierAuth["scheme"] }>
> = {
  ID_IDENTITY: { path: "/api/v1/catalog", scheme: "basic" },
  STANLEY_STELLA: { path: "/webservice/v2/products", scheme: "bearer" },
};

const CATALOG_KINDS = Object.keys(CATALOG_PROFILES) as SupplierKind[];

/** Pollt alle aktiven Connector-Lieferanten genau einmal. */
export async function runSupplierSync(env: RunnerEnv): Promise<SupplierRunSummary[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { kind: { in: CATALOG_KINDS }, active: true },
  });

  const intake = new TrpcSupplierIntake(env.apiUrl, env.apiHeaders);
  const logs = new PrismaIntegrationLogStore();
  const summaries: SupplierRunSummary[] = [];

  for (const s of suppliers) {
    const profile = CATALOG_PROFILES[s.kind as SupplierKind];
    if (!profile) continue;
    if (!s.baseUrl || !s.consumerKey || !s.consumerSecretEnc) {
      console.warn(`Supplier ${s.id} (${s.name}) ohne Zugangsdaten — übersprungen.`);
      continue;
    }

    const secret = decryptSecret(s.consumerSecretEnc, env.secretsKey);
    const auth: SupplierAuth =
      profile.scheme === "basic"
        ? { scheme: "basic", consumerKey: s.consumerKey, consumerSecret: secret }
        : { scheme: "bearer", token: secret };

    const client = new RestSupplierCatalogClient({
      baseUrl: s.baseUrl,
      catalogPath: profile.path,
      auth,
    });

    const startedAt = Date.now();
    try {
      const result = await new SupplierConnector(client, intake).run({
        supplierId: s.id,
        kind: s.kind as SupplierKind,
        cursor: s.syncCursor,
      });

      await prisma.supplier.update({ where: { id: s.id }, data: { syncCursor: result.nextCursor } });
      await logs.record({
        connector: `supplier-${s.kind.toLowerCase()}`,
        direction: "INBOUND",
        operation: "catalog.sync",
        status: "SUCCESS",
        attempt: 1,
        durationMs: Date.now() - startedAt,
      });

      console.log(
        `Supplier ${s.name}: ${result.upserted} Artikel (${result.skipped} übersprungen), Cursor → ${result.nextCursor}`
      );
      summaries.push({
        supplierId: s.id,
        upserted: result.upserted,
        skipped: result.skipped,
        nextCursor: result.nextCursor,
      });
    } catch (err) {
      await logs.record({
        connector: `supplier-${s.kind.toLowerCase()}`,
        direction: "INBOUND",
        operation: "catalog.sync",
        status: "FAILURE",
        attempt: 1,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`Supplier ${s.name}: Katalog-Sync fehlgeschlagen — ${String(err)}`);
    }
  }

  return summaries;
}

/** Einstiegspunkt des Worker-Prozesses. */
export async function main(): Promise<void> {
  const apiUrl = process.env.API_URL ?? "http://localhost:3000/trpc";
  const summaries = await runSupplierSync({ apiUrl, secretsKey: loadSecretsKey() });
  console.log(`Lieferanten-Sync fertig: ${summaries.length} Lieferant(en).`);
  await prisma.$disconnect();
}
