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

export function formatEur(cents: Cents): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}
