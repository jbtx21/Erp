// WooCommerce → ERP Mapping (rein, testbar) — Kap. 3, 8.2, 31.
// T-01: Bestellungen eines Shops mappen auf die Firma (Firmenkunde), NICHT auf
// das Mitarbeiter-Einzelkonto. Es dürfen keine Phantom-Kunden entstehen.

import { z } from "zod";

export const WooLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  // Preis pro Stück in Euro als String (WooCommerce-Konvention)
  price: z.union([z.string(), z.number()]),
  meta_data: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
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
  line_items: z.array(WooLineSchema),
});

export type WooOrder = z.infer<typeof WooOrderSchema>;

/** Config eines Shops: companyId zeigt IMMER auf die Firma (T-01). */
export interface ShopConnectorConfig {
  shopConnectorId: string;
  companyId: string;
}

/** Ergebnis des Mappings: ein Auftrag, der an die Firma gebunden ist. */
export interface MappedOrder {
  companyId: string;
  shopConnectorId: string;
  externalNumber: string;
  /** Mitarbeiter-Info NUR als Vermerk — erzeugt keinen Kundensatz (T-01). */
  employeeNote: string;
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

/**
 * Mappt eine WooCommerce-Bestellung auf einen ERP-Auftrag.
 * Die Firma kommt ausschließlich aus der Connector-Config — die Mitarbeiter-
 * identität (billing) wird nur als Notiz übernommen (T-01, Kap. 3.2/8.2).
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
    lines: order.line_items.map((li, idx) => ({
      position: idx + 1,
      description: li.name,
      qty: li.quantity,
      unitNetCents: eurToCents(li.price),
      rawPayload: li,
    })),
  };
}
