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

/**
 * Robustes Parsen einer FREITEXT-Geldeingabe (Euro) → Float oder null.
 *
 * Hintergrund: Mantine/`react-number-format` kann „." nicht gleichzeitig als
 * Tausenderpunkt UND Dezimaltrenner behandeln; „1.234,56" wird dort zu „1,23"
 * verstümmelt (FACH-PRICE-Bug). Dieser Parser betrachtet die GANZE Zeichenkette
 * statt Tastendruck für Tastendruck und entscheidet so eindeutig.
 *
 * Akzeptiert deutsche und gemischte Schreibweisen:
 *  - „1.234,56" → 1234.56  (Punkt = Tausender, Komma = Dezimal)
 *  - „1234,56"  → 1234.56
 *  - „9,90"     → 9.9
 *  - „9.90"     → 9.9      (einzelner Punkt, 1–2 Nachkommastellen ⇒ Dezimal)
 *  - „1.234"    → 1234     (einzelner Punkt, exakt 3 Folgestellen, 1–3-stellige
 *                           Vorzahl ⇒ Tausendergruppe, deutscher Default)
 *  - „1.234.567" → 1234567 (mehrere Punkte ⇒ Tausender)
 *  - „1,234.56" → 1234.56  (englische Mischform: rechtester Trenner = Dezimal)
 * Gibt null bei leerem/ungültigem Text zurück (Aufrufer entscheidet über Fallback).
 */
export function parseEuroInput(raw: string): number | null {
  const s = raw.replace(/[\s€]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  if (!/^[+-]?[\d.,]+$/.test(s)) return null;
  const neg = s.startsWith("-");
  const body = s.replace(/^[+-]/, "");
  const hasComma = body.includes(",");
  const hasDot = body.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    // Beide vorhanden: der RECHTESTE Trenner ist der Dezimaltrenner, der andere gruppiert.
    if (body.lastIndexOf(",") > body.lastIndexOf(".")) {
      normalized = body.replace(/\./g, "").replace(",", "."); // deutsch: 1.234,56
    } else {
      normalized = body.replace(/,/g, ""); // englisch: 1,234.56
    }
  } else if (hasComma) {
    // Nur Komma(s): letztes Komma = Dezimal, frühere = Tausender.
    const last = body.lastIndexOf(",");
    normalized = `${body.slice(0, last).replace(/,/g, "")}.${body.slice(last + 1)}`;
  } else if (hasDot) {
    const dots = body.split(".").length - 1;
    const last = body.lastIndexOf(".");
    const after = body.length - last - 1;
    const beforeLast = body.slice(0, last);
    if (dots >= 2) {
      normalized = body.replace(/\./g, ""); // mehrere Punkte ⇒ Tausender
    } else if (after === 3 && /^[1-9]\d{0,2}$/.test(beforeLast)) {
      normalized = body.replace(/\./g, ""); // 1.234 / 12.500 ⇒ Tausendergruppe
    } else {
      normalized = body; // 9.90 / 12.5 / 0.125 ⇒ Dezimalpunkt
    }
  } else {
    normalized = body;
  }
  const v = Number.parseFloat(normalized);
  if (Number.isNaN(v)) return null;
  return neg ? -v : v;
}

/** Geld-Anzeige für Eingabefelder: „1.234,56" (de-DE, 2 Nachkommastellen, ohne €-Symbol). */
export function formatEuroAmount(euros: number): string {
  return euros.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
