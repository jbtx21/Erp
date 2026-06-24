// Rückkanal ERP → Shop — Kap. 3.2, 4.2. Testfälle T-08 (Preis-Push), T-09 (Status/Tracking).
// Reine Payload-Bbuilder: erzeugen die an den Shop zu sendenden Daten, ohne IO.
// Der Connector (Worker-Tier) ruft diese Builder und überträgt das Ergebnis.

import type { Cents } from "./money.js";
import type { PriceGroupKind, VariantPrice } from "./pricing.js";
import { resolvePrice } from "./pricing.js";
import type { OrderStatus } from "./order.js";
import { buildTrackingUrl, type Carrier } from "./tracking.js";

// ── Preis-Push (T-08): ERP ist Preis-Master, Shop zeigt nur an ──────────────

export interface ShopPriceUpdate {
  /** Externe Produkt-/Varianten-Referenz im Shop. */
  externalRef: string;
  netCents: Cents;
}

export interface VariantForPush {
  externalRef: string;
  prices: ReadonlyArray<VariantPrice>;
}

/**
 * Baut die Preis-Updates für einen Shop, der einer Firma mit gegebener
 * Preisgruppe zugeordnet ist (Kap. 3.2 / T-08). Varianten ohne Preis der Gruppe
 * werden gemeldet statt still übersprungen (Pflegefehler sichtbar machen).
 */
export function buildShopPricePush(
  variants: ReadonlyArray<VariantForPush>,
  group: PriceGroupKind
): { updates: ShopPriceUpdate[]; missing: string[] } {
  const updates: ShopPriceUpdate[] = [];
  const missing: string[] = [];
  for (const v of variants) {
    try {
      updates.push({ externalRef: v.externalRef, netCents: resolvePrice(v.prices, group) });
    } catch {
      missing.push(v.externalRef);
    }
  }
  return { updates, missing };
}

// ── Status-/Tracking-Push (T-09): ERP-Auftragsstatus → Shop-Bestellstatus ───

// ERP-Auftragsstatus `OrderStatus` ist in order.ts definiert (F2, kanonische
// Heimat mit Zustandsmaschine) und wird hier auf den Shop-Status abgebildet.

/** WooCommerce-Bestellstatus, an den abgebildet wird. */
export type WooStatus = "processing" | "on-hold" | "completed" | "cancelled";

const STATUS_MAP: Record<OrderStatus, WooStatus> = {
  ANGELEGT: "processing",
  IN_BEARBEITUNG: "processing",
  IN_PRODUKTION: "on-hold",
  VERSANDBEREIT: "on-hold",
  VERSENDET: "completed",
  FAKTURIERT: "completed",
  ABGESCHLOSSEN: "completed",
  STORNIERT: "cancelled",
};

export interface ShopStatusUpdate {
  externalOrderNumber: string;
  status: WooStatus;
  /** Trackingnummer, sobald versendet (Kap. 4.2 / T-06/T-09). */
  trackingNumber?: string;
  /** Versanddienstleister (für korrekte Tracking-Links im Shop). */
  carrier?: Carrier;
  /** Fertiger Tracking-Link aus Carrier + Nummer (sofern Vorlage vorhanden). */
  trackingUrl?: string;
}

/**
 * Bildet den ERP-Auftragsstatus auf den Shop-Status ab und hängt Tracking +
 * Carrier + Tracking-Link an, sobald der Auftrag versendet ist (T-09). Tracking nur
 * im Status VERSENDET, damit der Kunde keine leere Sendungsverfolgung sieht.
 */
export function buildShopStatusUpdate(input: {
  externalOrderNumber: string;
  status: OrderStatus;
  trackingNumber?: string | null;
  carrier?: Carrier | null;
}): ShopStatusUpdate {
  const status = STATUS_MAP[input.status];
  const out: ShopStatusUpdate = {
    externalOrderNumber: input.externalOrderNumber,
    status,
  };
  if (input.status === "VERSENDET" && input.trackingNumber) {
    out.trackingNumber = input.trackingNumber;
    if (input.carrier) out.carrier = input.carrier;
    const url = buildTrackingUrl(input.carrier, input.trackingNumber);
    if (url) out.trackingUrl = url;
  }
  return out;
}
