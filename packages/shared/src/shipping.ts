// Versand / DPD — Kap. 4.2, 14. Testfall T-06.
// Reiner Builder für die DPD-Label-Anfrage aus Auftrag + Lieferadresse. Der
// tatsächliche API-Call (und das Rückschreiben der Trackingnummer) passiert im
// Worker-Tier; die Trackingnummer geht anschließend an den Shop (T-09, shop-sync).

export interface ShippingAddress {
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string; // ISO-2, z. B. "DE"
}

export interface DpdLabelRequest {
  reference: string; // Auftragsnummer
  recipient: ShippingAddress;
  weightGrams: number;
  parcelCount: number;
}

export class ShippingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShippingValidationError";
  }
}

/**
 * Baut die DPD-Label-Anfrage (T-06). Validiert die für ein Versandlabel
 * zwingenden Felder, damit kein unvollständiges Label angefordert wird.
 */
export function buildDpdLabelRequest(input: {
  orderNumber: string;
  recipient: ShippingAddress;
  weightGrams: number;
  parcelCount?: number;
}): DpdLabelRequest {
  const r = input.recipient;
  if (!r.name.trim() || !r.street.trim() || !r.zip.trim() || !r.city.trim()) {
    throw new ShippingValidationError("Lieferadresse unvollständig (T-06).");
  }
  if (input.weightGrams <= 0) {
    throw new ShippingValidationError("Versandgewicht fehlt (T-06).");
  }
  return {
    reference: input.orderNumber,
    recipient: { ...r, country: r.country || "DE" },
    weightGrams: input.weightGrams,
    parcelCount: input.parcelCount ?? 1,
  };
}
