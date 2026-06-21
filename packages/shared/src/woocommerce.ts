// WooCommerce → ERP Mapping (rein, testbar) — Kap. 3, 8.2, 31.
// T-01: Bestellungen eines Shops mappen auf die Firma (Firmenkunde), NICHT auf
// das Mitarbeiter-Einzelkonto. Es dürfen keine Phantom-Kunden entstehen.

import { z } from "zod";
import type { ShippingAddress } from "./shipping.js";

export const WooLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  // Preis pro Stück in Euro als String (WooCommerce-Konvention)
  price: z.union([z.string(), z.number()]),
  meta_data: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
});

const WooAddressSchema = z.object({
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  company: z.string().default(""),
  address_1: z.string().default(""),
  postcode: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("DE"),
});

export const WooOrderSchema = z.object({
  id: z.number().int(),
  number: z.string(),
  status: z.string(),
  // Das einkaufende Mitarbeiter-Konto im Shop
  billing: z.object({
    first_name: z.string().default(""),
    last_name: z.string().default(""),
    email: z.string().default(""),
  }),
  // Im Shop eingegebene Lieferadresse (nur bei Policy FREIE_EINGABE relevant)
  shipping: WooAddressSchema.optional(),
  line_items: z.array(WooLineSchema),
});

export type WooOrder = z.infer<typeof WooOrderSchema>;

/** Lieferadress-Regelung je Shop (K-08, Kap. 8.2). */
export type DeliveryAddressPolicy = "FEST" | "FREIE_EINGABE" | "AUSWAHL";

/** Config eines Shops: companyId zeigt IMMER auf die Firma (T-01). */
export interface ShopConnectorConfig {
  shopConnectorId: string;
  companyId: string;
  /** Default FEST: Firmen-Lieferadresse, Mitarbeiter kann nicht ändern. */
  deliveryAddressPolicy?: DeliveryAddressPolicy;
}

/**
 * Aufgelöste Lieferadress-Entscheidung (K-08):
 * - FEST → feste Firmenadresse (Office/ERP setzt sie, kein `address`).
 * - FREIE_EINGABE → die im Shop eingegebene Adresse wird übernommen (`address`).
 * - AUSWAHL → Büro wählt aus hinterlegten Firmen-Lieferadressen (kein `address`).
 */
export interface DeliveryResolution {
  policy: DeliveryAddressPolicy;
  address?: ShippingAddress;
}

/** Ergebnis des Mappings: ein Auftrag, der an die Firma gebunden ist. */
export interface MappedOrder {
  companyId: string;
  shopConnectorId: string;
  externalNumber: string;
  /** Mitarbeiter-Info NUR als Vermerk — erzeugt keinen Kundensatz (T-01). */
  employeeNote: string;
  delivery: DeliveryResolution;
  lines: MappedOrderLine[];
}

export interface MappedOrderLine {
  position: number;
  description: string;
  qty: number;
  unitNetCents: number;
  rawPayload: unknown;
}

function eurToCents(price: string | number): number {
  const v = typeof price === "string" ? Number.parseFloat(price) : price;
  if (Number.isNaN(v)) throw new Error(`invalid price: ${String(price)}`);
  return Math.round(v * 100);
}

/** Setzt die Lieferadress-Entscheidung gemäß Shop-Policy um (K-08). */
function resolveDelivery(
  order: WooOrder,
  policy: DeliveryAddressPolicy
): DeliveryResolution {
  if (policy !== "FREIE_EINGABE" || !order.shipping) {
    return { policy };
  }
  const s = order.shipping;
  const name = s.company || `${s.first_name} ${s.last_name}`.trim();
  // Nur übernehmen, wenn die Adresse fachlich brauchbar ist.
  if (!name || !s.address_1 || !s.postcode || !s.city) {
    return { policy };
  }
  return {
    policy,
    address: {
      name,
      street: s.address_1,
      zip: s.postcode,
      city: s.city,
      country: s.country || "DE",
    },
  };
}

/**
 * Mappt eine WooCommerce-Bestellung auf einen ERP-Auftrag.
 * Die Firma kommt ausschließlich aus der Connector-Config — die Mitarbeiter-
 * identität (billing) wird nur als Notiz übernommen (T-01, Kap. 3.2/8.2).
 * Die Lieferadresse folgt der Shop-Policy (K-08): nur bei FREIE_EINGABE wird die
 * im Shop erfasste Adresse übernommen, sonst Firmenadresse/Auswahl im Büro.
 */
export function mapWooOrder(
  raw: unknown,
  config: ShopConnectorConfig
): MappedOrder {
  const order = WooOrderSchema.parse(raw);
  const employee = `${order.billing.first_name} ${order.billing.last_name}`.trim();
  const employeeNote = employee
    ? `${employee}${order.billing.email ? ` <${order.billing.email}>` : ""}`
    : order.billing.email;

  return {
    companyId: config.companyId,
    shopConnectorId: config.shopConnectorId,
    externalNumber: order.number,
    employeeNote,
    delivery: resolveDelivery(order, config.deliveryAddressPolicy ?? "FEST"),
    lines: order.line_items.map((li, idx) => ({
      position: idx + 1,
      description: li.name,
      qty: li.quantity,
      unitNetCents: eurToCents(li.price),
      rawPayload: li,
    })),
  };
}
