// Anwendungsfall: Versand bestätigen (T-06/T-09, C4). Der Worker holt versandbereite
// Aufträge, erzeugt das DPD-Label und meldet die Trackingnummer über `confirmShipped`
// zurück: Der Auftrag wird auf VERSENDET gesetzt, die Trackingnummer gespeichert und
// ein Outbox-Event `order.status.update` eingereiht (Shop-Push übernimmt der Relay).
// Repository als Interface → testbar ohne DB.

import type { Carrier, ShippingAddress } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface ShippableOrder {
  id: string;
  number: string;
  externalNumber: string | null;
  shopConnectorId: string | null;
  recipient: ShippingAddress;
  weightGrams: number;
}

export interface ConfirmShippedResult {
  orderId: string;
  externalNumber: string | null;
  trackingNumber: string;
}

/** Versandbereiter Auftrag, der wegen eines Gates NICHT in der Versandliste erscheint. */
export interface BlockedShipment {
  id: string;
  number: string;
  companyName: string;
  /** Lesbare Gründe (Lieferadresse fehlt / Liefersperre / QS offen) — Versand-Gate sichtbar. */
  reasons: string[];
}

export interface ShipmentRepository {
  /** Aufträge im Status VERSANDBEREIT mit hinterlegter Lieferadresse. */
  listShippable(limit: number): Promise<ShippableOrder[]>;
  /** VERSANDBEREITE Aufträge, die ein Gate blockiert (fehlende Adresse / Liefersperre / QS). */
  listBlocked(limit: number): Promise<BlockedShipment[]>;
  /**
   * Setzt den Auftrag auf VERSENDET + Trackingnummer und reiht — in derselben
   * Transaktion — ein Outbox-Event `order.status.update` ein (Shop-Rückmeldung).
   */
  confirmShipped(input: { orderId: string; trackingNumber: string; carrier?: Carrier }): Promise<ConfirmShippedResult>;
}

export class ShipmentService {
  constructor(
    private readonly repo: ShipmentRepository,
    private readonly audit: AuditSink
  ) {}

  listShippable(limit: number): Promise<ShippableOrder[]> {
    return this.repo.listShippable(limit);
  }

  /** Versandbereite Aufträge, die ein Gate blockiert — macht „Keine Daten" erklärbar (T-06). */
  listBlocked(limit: number): Promise<BlockedShipment[]> {
    return this.repo.listBlocked(limit);
  }

  async confirmShipped(input: { orderId: string; trackingNumber: string; carrier?: Carrier }): Promise<ConfirmShippedResult> {
    const res = await this.repo.confirmShipped(input);
    await this.audit.append(
      buildEntry({
        entity: "Order",
        entityId: input.orderId,
        action: "UPDATE",
        after: { status: "VERSENDET", lieferstatus: "VOLL", trackingNumber: input.trackingNumber, carrier: input.carrier ?? null },
      })
    );
    return res;
  }
}
