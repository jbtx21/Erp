// Worker-Runner (run once) für den DPD-Versand (T-06). Holt versandbereite Aufträge
// per tRPC, erzeugt Labels und meldet die Trackingnummern zurück; protokolliert den
// Lauf im IntegrationLog (OUTBOUND/"dpd.label"). Scheduler/Queue = C2 (Laufzeitpaket).
//
// DPD-Zugangsdaten kommen (mangels eigenem DB-Modell) aus der Umgebung. Eine spätere
// DB-gestützte Mehrkonten-Konfiguration (analog ShopConnector) ist möglich.

import { prisma } from "@texma/db";
import { PrismaIntegrationLogStore } from "@texma/worker-orchestration";
import { DpdShipmentConnector } from "./index.js";
import { DpdRestClient, type DpdAuth } from "./dpd-client.js";
import { TrpcShipmentPort } from "./trpc-shipment-port.js";

export interface RunnerEnv {
  apiUrl: string;
  baseUrl: string;
  auth: DpdAuth;
  apiHeaders?: Record<string, string>;
}

export interface DpdRunSummary {
  shipped: number;
}

/** Führt den DPD-Versand genau einmal aus. */
export async function runDpdShipments(env: RunnerEnv): Promise<DpdRunSummary> {
  const client = new DpdRestClient({ baseUrl: env.baseUrl, auth: env.auth });
  const port = new TrpcShipmentPort(env.apiUrl, env.apiHeaders);
  const logs = new PrismaIntegrationLogStore();

  const startedAt = Date.now();
  try {
    const result = await new DpdShipmentConnector(client, port).run();
    await logs.record({
      connector: "dpd",
      direction: "OUTBOUND",
      operation: "dpd.label",
      status: "SUCCESS",
      attempt: 1,
      durationMs: Date.now() - startedAt,
    });
    console.log(`DPD-Versand: ${result.shipped} Label(s) erzeugt.`);
    return result;
  } catch (err) {
    await logs.record({
      connector: "dpd",
      direction: "OUTBOUND",
      operation: "dpd.label",
      status: "FAILURE",
      attempt: 1,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Liest die DPD-Auth aus der Umgebung (Basic oder Bearer). */
export function dpdAuthFromEnv(env: NodeJS.ProcessEnv = process.env): DpdAuth {
  if (env.DPD_TOKEN) return { scheme: "bearer", token: env.DPD_TOKEN };
  if (env.DPD_USER && env.DPD_PASSWORD) {
    return { scheme: "basic", user: env.DPD_USER, password: env.DPD_PASSWORD };
  }
  throw new Error("DPD-Zugangsdaten fehlen (DPD_TOKEN oder DPD_USER/DPD_PASSWORD).");
}

/** Einstiegspunkt des Worker-Prozesses. */
export async function main(): Promise<void> {
  const apiUrl = process.env.API_URL ?? "http://localhost:3000/trpc";
  const baseUrl = process.env.DPD_BASE_URL ?? "https://api.dpd.example";
  await runDpdShipments({ apiUrl, baseUrl, auth: dpdAuthFromEnv() });
  await prisma.$disconnect();
}
