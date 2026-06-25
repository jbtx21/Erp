// Worker-Laufzeit (C2): verdrahtet Outbox-Relay (Outbound, mit Dispatcher) und die
// wiederkehrenden Connector-Polls (Inbound) auf einer Redis/BullMQ-Instanz. Hier
// laufen die Teile zusammen, die andernorts bewusst entkoppelt sind — ohne dass die
// Connector-Pakete vom Orchestrierungspaket abhängen müssen (Zyklusvermeidung).

import { createRetryPolicy, secretsProviderFromEnv, type SecretsProvider } from "@texma/shared";
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
import { WooRestClient, TrpcOrderIntake, runWooSync } from "@texma/connector-woocommerce";
import type { OutboxHandler } from "@texma/orchestration";
import { runSupplierSync } from "@texma/connector-supplier";
import { dpdAuthFromEnv, runDpdShipments } from "@texma/connector-dpd";
import { createOrderStatusUpdateHandler, type ShopWriter } from "./order-status-handler.js";
import { ShopifyWriter } from "./shopify-writer.js";

/**
 * Auto-Bündelung am Periodenende (Cron, Kap. 18.2): schließt alle offenen Sammel-
 * bestellungen, deren Periode abgelaufen ist (Status → GEBUENDELT, closedAt gesetzt),
 * und schreibt je Vorgang einen GoBD-Audit-Eintrag. Selbstständig über Prisma — neue
 * Bestellungen der Folgeperiode landen automatisch in einer frischen Sammelbestellung.
 */
export async function runSammelAutoBundle(now: Date = new Date()): Promise<{ bundled: number }> {
  const due = await prisma.collectiveOrder.findMany({
    where: { status: "OFFEN", periodEnd: { lte: now } },
    select: { id: true },
  });
  if (due.length === 0) return { bundled: 0 };
  await prisma.$transaction(async (tx) => {
    for (const d of due) {
      await tx.collectiveOrder.update({ where: { id: d.id }, data: { status: "GEBUENDELT", closedAt: now } });
      // GoBD-Audit (append-only) für den automatischen Statuswechsel.
      await tx.auditLog.create({ data: { entity: "CollectiveOrder", entityId: d.id, action: "UPDATE", after: { status: "GEBUENDELT", auto: true } } });
    }
  });
  console.log(`Sammelbestellung-Auto-Bündelung: ${due.length} Periode(n) geschlossen.`);
  return { bundled: due.length };
}

/**
 * Baut den Shop-Schreibclient je Connector-Art aus den DB-Daten (Secret via Port) —
 * shop-übergreifend (WooCommerce/Shopify). So läuft die Status-/Tracking-Rückmeldung
 * für jeden angebundenen Shop über denselben Outbox-Handler.
 */
function prismaShopWriterResolver(secrets: SecretsProvider) {
  return async (shopConnectorId: string): Promise<ShopWriter> => {
    const sc = await prisma.shopConnector.findUnique({ where: { id: shopConnectorId } });
    if (!sc || !sc.consumerSecretEnc) {
      throw new Error(`ShopConnector ${shopConnectorId} ohne Zugangsdaten — Status-Push nicht möglich.`);
    }
    if (sc.kind === "SHOPIFY") {
      // baseUrl = myshopify-Domain, Secret = Admin-API-Access-Token.
      return new ShopifyWriter({
        shopDomain: sc.baseUrl,
        accessToken: await secrets.resolve(sc.consumerSecretEnc),
      });
    }
    if (!sc.consumerKey) {
      throw new Error(`ShopConnector ${shopConnectorId} (WooCommerce) ohne Consumer Key — Status-Push nicht möglich.`);
    }
    return new WooRestClient({
      baseUrl: sc.baseUrl,
      consumerKey: sc.consumerKey,
      consumerSecret: await secrets.resolve(sc.consumerSecretEnc),
    });
  };
}

/**
 * Outbox-Handler `shop.order.fetch` (manueller Sofort-Abruf, Kap. 4.1): holt EINE
 * Bestellung über ihre Shop-Nummer, importiert sie per tRPC und markiert sie als
 * „in Bearbeitung". Reine Routing-/HTTP-Logik mit injizierter Shop-Anbindung.
 */
function createShopOrderFetchHandler(deps: { apiUrl: string; secrets: SecretsProvider }): OutboxHandler {
  const intake = new TrpcOrderIntake(deps.apiUrl);
  return async (record) => {
    const p = record.payload as { shopConnectorId: string; externalNumber: string };
    const sc = await prisma.shopConnector.findUnique({ where: { id: p.shopConnectorId } });
    if (!sc) throw new Error(`ShopConnector ${p.shopConnectorId} nicht gefunden.`);
    if (sc.kind !== "WOOCOMMERCE" || !sc.consumerKey || !sc.consumerSecretEnc) {
      throw new Error(`Manueller Abruf für ${p.shopConnectorId} nicht möglich (kein WooCommerce-Zugang).`);
    }
    const client = new WooRestClient({
      baseUrl: sc.baseUrl,
      consumerKey: sc.consumerKey,
      consumerSecret: await deps.secrets.resolve(sc.consumerSecretEnc),
    });
    const raw = await client.fetchOrderByNumber(p.externalNumber);
    if (!raw) throw new Error(`Bestellung ${p.externalNumber} im Shop ${sc.name} nicht gefunden.`);
    await intake.importWooOrder(raw, { shopConnectorId: sc.id, companyId: sc.companyId, deliveryAddressPolicy: sc.deliveryAddressPolicy }, true);
  };
}

export interface RuntimeConfig {
  redisHost: string;
  redisPort: number;
  apiUrl: string;
  /** Secrets-Manager-Port (ADR 0002): löst gespeicherte Secret-Referenzen auf. */
  secrets: SecretsProvider;
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
      resolveShopWriter: prismaShopWriterResolver(config.secrets),
    }),
    // Manueller Sofort-Abruf einer Einzelbestellung (dringende Aufträge).
    "shop.order.fetch": createShopOrderFetchHandler({ apiUrl: config.apiUrl, secrets: config.secrets }),
  });
  const relay = new OutboxRelay(new PrismaOutboxStore(), dispatcher, new PrismaIntegrationLogStore(), createRetryPolicy(5));
  const outboxQueue = createOutboxQueue(connection);
  createOutboxWorker(connection, relay);
  await scheduleOutboxTicks(outboxQueue);

  // Inbound: wiederkehrende Connector-Polls.
  const connectorQueue = createConnectorQueue(connection);
  createConnectorWorker(connection, {
    "supplier.sync": () => runSupplierSync({ apiUrl: config.apiUrl, secrets: config.secrets }),
    "woocommerce.sync": () => runWooSync({ apiUrl: config.apiUrl, secrets: config.secrets }),
    "dpd.ship": () =>
      runDpdShipments({ apiUrl: config.apiUrl, baseUrl: config.dpdBaseUrl, auth: dpdAuthFromEnv() }),
    // Sammelbestellung am Periodenende automatisch bündeln (Kap. 18.2).
    "sammel.autoBundle": () => runSammelAutoBundle(),
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
    secrets: await secretsProviderFromEnv(),
    dpdBaseUrl: process.env.DPD_BASE_URL ?? "https://api.dpd.example",
    schedule: {
      "supplier.sync": Number(process.env.SUPPLIER_POLL_MS ?? 3_600_000),
      "woocommerce.sync": Number(process.env.WOO_POLL_MS ?? 300_000),
      "dpd.ship": Number(process.env.DPD_POLL_MS ?? 300_000),
      // Periodenende-Prüfung 1×/Stunde (idempotent: schließt nur abgelaufene Perioden).
      "sammel.autoBundle": Number(process.env.SAMMEL_BUNDLE_MS ?? 3_600_000),
    },
  });
}
