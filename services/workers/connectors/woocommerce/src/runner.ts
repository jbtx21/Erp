// Worker-Runner (run once) für den WooCommerce-Poll. Liest aktive Connectoren via
// Prisma, baut je Shop den echten REST-Client + tRPC-Intake, pollt und schreibt den
// syncCursor zurück. Scheduler/Queue (BullMQ, Retry/Outbox) = Block C2.

import { prisma } from "@texma/db";
import { decryptSecret, loadSecretsKey } from "@texma/shared";
import { WooCommerceConnector } from "./index.js";
import { TrpcOrderIntake } from "./trpc-intake.js";
import { WooRestClient } from "./woo-rest-client.js";

export interface RunnerEnv {
  apiUrl: string; // tRPC-Endpunkt von apps/api, z. B. http://localhost:3000/trpc
  secretsKey: Buffer;
}

export interface ShopRunSummary {
  shopConnectorId: string;
  importedCount: number;
  nextCursor: string;
}

/** Pollt alle aktiven WooCommerce-Connectoren genau einmal. */
export async function runWooSync(env: RunnerEnv): Promise<ShopRunSummary[]> {
  const connectors = await prisma.shopConnector.findMany({
    where: { kind: "WOOCOMMERCE", active: true },
  });

  const intake = new TrpcOrderIntake(env.apiUrl);
  const summaries: ShopRunSummary[] = [];

  for (const sc of connectors) {
    if (!sc.consumerKey || !sc.consumerSecretEnc) {
      console.warn(`ShopConnector ${sc.id} (${sc.name}) ohne Zugangsdaten — übersprungen.`);
      continue;
    }

    const client = new WooRestClient({
      baseUrl: sc.baseUrl,
      consumerKey: sc.consumerKey,
      consumerSecret: decryptSecret(sc.consumerSecretEnc, env.secretsKey),
    });

    const result = await new WooCommerceConnector(client, intake).run({
      shopConnectorId: sc.id,
      companyId: sc.companyId,
      deliveryAddressPolicy: sc.deliveryAddressPolicy,
      cursor: sc.syncCursor,
    });

    await prisma.shopConnector.update({
      where: { id: sc.id },
      data: { syncCursor: result.nextCursor },
    });

    console.log(`Shop ${sc.name}: ${result.importedCount} Bestellungen, Cursor → ${result.nextCursor}`);
    summaries.push({ shopConnectorId: sc.id, importedCount: result.importedCount, nextCursor: result.nextCursor });
  }

  return summaries;
}

/** Einstiegspunkt des Worker-Prozesses. */
export async function main(): Promise<void> {
  const apiUrl = process.env.API_URL ?? "http://localhost:3000/trpc";
  const summaries = await runWooSync({ apiUrl, secretsKey: loadSecretsKey() });
  console.log(`WooCommerce-Sync fertig: ${summaries.length} Shop(s).`);
  await prisma.$disconnect();
}
