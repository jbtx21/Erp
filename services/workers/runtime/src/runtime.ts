// Worker-Laufzeit (C2): verdrahtet Outbox-Relay (Outbound, mit Dispatcher) und die
// wiederkehrenden Connector-Polls (Inbound) auf einer Redis/BullMQ-Instanz. Hier
// laufen die Teile zusammen, die andernorts bewusst entkoppelt sind — ohne dass die
// Connector-Pakete vom Orchestrierungspaket abhängen müssen (Zyklusvermeidung).

import { createRetryPolicy, decryptSecret, loadSecretsKey } from "@texma/shared";
import { createDispatcher, OutboxRelay } from "@texma/orchestration";
import {
  PrismaIntegrationLogStore,
  PrismaOutboxStore,
  createConnectorQueue,
  createConnectorWorker,
  createOutboxQueue,
  createOutboxWorker,
  scheduleConnectorPolls,
  scheduleOutboxTicks,
} from "@texma/worker-orchestration";
import { prisma } from "@texma/db";
import { WooRestClient, runWooSync } from "@texma/connector-woocommerce";
import { runSupplierSync } from "@texma/connector-supplier";
import { dpdAuthFromEnv, runDpdShipments } from "@texma/connector-dpd";
import { createOrderStatusUpdateHandler, type ShopWriter } from "./order-status-handler.js";

/** Baut den Shop-Schreibclient für eine Connector-Id aus den (entschlüsselten) DB-Daten. */
function prismaShopWriterResolver(secretsKey: Buffer) {
  return async (shopConnectorId: string): Promise<ShopWriter> => {
    const sc = await prisma.shopConnector.findUnique({ where: { id: shopConnectorId } });
    if (!sc || !sc.consumerKey || !sc.consumerSecretEnc) {
      throw new Error(`ShopConnector ${shopConnectorId} ohne Zugangsdaten — Status-Push nicht möglich.`);
    }
    return new WooRestClient({
      baseUrl: sc.baseUrl,
      consumerKey: sc.consumerKey,
      consumerSecret: decryptSecret(sc.consumerSecretEnc, secretsKey),
    });
  };
}

export interface RuntimeConfig {
  redisHost: string;
  redisPort: number;
  apiUrl: string;
  secretsKey: Buffer;
  dpdBaseUrl: string;
  /** Poll-Intervalle in ms je Connector-Job. */
  schedule: Record<string, number>;
}

/** Startet Outbox-Relay + Connector-Polls (langlebiger Prozess). */
export async function startWorkerRuntime(config: RuntimeConfig): Promise<void> {
  const connection = { host: config.redisHost, port: config.redisPort, maxRetriesPerRequest: null };

  // Outbound: Outbox-Relay mit Dispatcher (Shop-Status-Push).
  const dispatcher = createDispatcher({
    "order.status.update": createOrderStatusUpdateHandler({
      resolveShopWriter: prismaShopWriterResolver(config.secretsKey),
    }),
  });
  const relay = new OutboxRelay(new PrismaOutboxStore(), dispatcher, new PrismaIntegrationLogStore(), createRetryPolicy(5));
  const outboxQueue = createOutboxQueue(connection);
  createOutboxWorker(connection, relay);
  await scheduleOutboxTicks(outboxQueue);

  // Inbound: wiederkehrende Connector-Polls.
  const connectorQueue = createConnectorQueue(connection);
  createConnectorWorker(connection, {
    "supplier.sync": () => runSupplierSync({ apiUrl: config.apiUrl, secretsKey: config.secretsKey }),
    "woocommerce.sync": () => runWooSync({ apiUrl: config.apiUrl, secretsKey: config.secretsKey }),
    "dpd.ship": () =>
      runDpdShipments({ apiUrl: config.apiUrl, baseUrl: config.dpdBaseUrl, auth: dpdAuthFromEnv() }),
  });
  await scheduleConnectorPolls(connectorQueue, config.schedule);

  console.log("Worker-Laufzeit gestartet (Outbox-Relay + Connector-Polls).");
}

/** Prozess-Einstiegspunkt: liest die Konfiguration aus der Umgebung. */
export async function main(): Promise<void> {
  await startWorkerRuntime({
    redisHost: process.env.REDIS_HOST ?? "127.0.0.1",
    redisPort: Number(process.env.REDIS_PORT ?? 6379),
    apiUrl: process.env.API_URL ?? "http://localhost:3000/trpc",
    secretsKey: loadSecretsKey(),
    dpdBaseUrl: process.env.DPD_BASE_URL ?? "https://api.dpd.example",
    schedule: {
      "supplier.sync": Number(process.env.SUPPLIER_POLL_MS ?? 3_600_000),
      "woocommerce.sync": Number(process.env.WOO_POLL_MS ?? 300_000),
      "dpd.ship": Number(process.env.DPD_POLL_MS ?? 300_000),
    },
  });
}
