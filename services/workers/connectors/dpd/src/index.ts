// DPD-Versand-Connector (Worker-Tier) — Kap. 4.2, 32. Testfall T-06.
// Holt versandbereite Aufträge (über die tRPC-Shipment-Port), erzeugt je Auftrag ein
// DPD-Label (DpdClient) und meldet die Trackingnummer zurück (confirmShipped). Der
// Shop-Push (Status + Tracking) läuft danach über die Outbox (order.status.update).

import { buildDpdLabelRequest, type DpdLabelRequest, type ShippingAddress } from "@texma/shared";

/** Gemeinsame Connector-Schnittstelle für alle externen Systeme (Kap. 32). */
export interface Connector<TConfig, TResult> {
  readonly kind: string;
  run(config: TConfig): Promise<TResult>;
}

export interface DpdLabelResult {
  trackingNumber: string;
  /** Optionale Label-Daten (z. B. base64-PDF) — Archivierung später (C5). */
  labelData?: string;
}

/** Ruft die DPD-API für ein Versandlabel. */
export interface DpdClient {
  requestLabel(req: DpdLabelRequest): Promise<DpdLabelResult>;
}

/** Versandbereiter Auftrag (Teilmenge der tRPC-Antwort). */
export interface ShippableOrderDTO {
  id: string;
  number: string;
  recipient: ShippingAddress;
  weightGrams: number;
}

/** Anbindung an apps/api (shipments.listShippable / confirmShipped). */
export interface ShipmentPort {
  listShippable(): Promise<ShippableOrderDTO[]>;
  confirmShipped(orderId: string, trackingNumber: string): Promise<unknown>;
}

export interface DpdRunResult {
  shipped: number;
}

export class DpdShipmentConnector implements Connector<void, DpdRunResult> {
  readonly kind = "dpd";

  constructor(
    private readonly client: DpdClient,
    private readonly port: ShipmentPort
  ) {}

  async run(): Promise<DpdRunResult> {
    const orders = await this.port.listShippable();
    let shipped = 0;
    for (const o of orders) {
      const req = buildDpdLabelRequest({
        orderNumber: o.number,
        recipient: o.recipient,
        weightGrams: o.weightGrams,
      });
      const { trackingNumber } = await this.client.requestLabel(req);
      await this.port.confirmShipped(o.id, trackingNumber);
      shipped++;
    }
    return { shipped };
  }
}

export { DpdRestClient, type DpdRestClientOptions, type DpdAuth } from "./dpd-client.js";
export { TrpcShipmentPort } from "./trpc-shipment-port.js";
export { runDpdShipments, dpdAuthFromEnv, type RunnerEnv, type DpdRunSummary } from "./runner.js";
