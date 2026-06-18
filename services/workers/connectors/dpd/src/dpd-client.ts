// Echter DPD-REST-Client (Kap. 4.2). Fordert ein Versandlabel an und liefert die
// Trackingnummer zurück. Auth wahlweise HTTP Basic oder Bearer; `fetch` injizierbar
// für Tests. Robuste Orchestrierung (Retry/Backoff) übernimmt der Outbox-/Scheduler-
// Pfad (C2); hier ein schlanker, einzelner POST je Label.

import type { DpdLabelRequest } from "@texma/shared";
import type { DpdClient, DpdLabelResult } from "./index.js";

export type DpdAuth =
  | { scheme: "basic"; user: string; password: string }
  | { scheme: "bearer"; token: string };

export interface DpdRestClientOptions {
  baseUrl: string;
  auth: DpdAuth;
  /** Label-Endpunkt, default "/api/v1/shipments". */
  shipmentPath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface DpdShipmentResponse {
  trackingNumber?: string;
  parcels?: Array<{ trackingNumber?: string }>;
  label?: string;
}

export class DpdRestClient implements DpdClient {
  private readonly base: string;
  private readonly path: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: DpdRestClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.path = opts.shipmentPath ?? "/api/v1/shipments";
    this.authHeader =
      opts.auth.scheme === "basic"
        ? "Basic " + Buffer.from(`${opts.auth.user}:${opts.auth.password}`).toString("base64")
        : `Bearer ${opts.auth.token}`;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async requestLabel(req: DpdLabelRequest): Promise<DpdLabelResult> {
    const res = await this.fetchImpl(`${this.base}${this.path}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`DPD-Authentifizierung fehlgeschlagen (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      throw new Error(`DPD-Labelanforderung fehlgeschlagen (HTTP ${res.status}) für ${req.reference}.`);
    }

    const data = (await res.json()) as DpdShipmentResponse;
    const trackingNumber = data.trackingNumber ?? data.parcels?.[0]?.trackingNumber;
    if (!trackingNumber) {
      throw new Error(`DPD-Antwort ohne Trackingnummer für ${req.reference}.`);
    }
    return { trackingNumber, labelData: data.label };
  }
}
