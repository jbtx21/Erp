// Geldarithmetik in Cent (Integer) — niemals Float für Beträge.
// Kap. 9 (Faktura/OP), Kap. 4.4 (Preise/DB).

export type Cents = number;

/** Kaufmännisch runden auf ganze Cent. */
export function roundCents(value: number): Cents {
  return Math.round(value);
}

/** Nettobetrag aus Stück × Einzelpreis (Cent). */
export function lineNet(qty: number, unitNetCents: Cents): Cents {
  if (qty < 0) throw new Error("qty must be >= 0");
  return roundCents(qty * unitNetCents);
}

/** Steuer auf Nettobetrag (z. B. 0.19). */
export function taxOnNet(netCents: Cents, rate: number): Cents {
  if (rate < 0) throw new Error("rate must be >= 0");
  return roundCents(netCents * rate);
}

/** Brutto = Netto + Steuer. */
export function gross(netCents: Cents, rate: number): Cents {
  return netCents + taxOnNet(netCents, rate);
}

/** Euro-Betrag (Dezimal-String oder Zahl) → ganze Cent. Wirft bei ungültigem Wert. */
export function eurToCents(price: string | number): Cents {
  const v = typeof price === "string" ? Number.parseFloat(price.replace(",", ".")) : price;
  if (Number.isNaN(v)) throw new Error(`invalid price: ${String(price)}`);
  return roundCents(v * 100);
}

export function formatEur(cents: Cents): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}
