// Geld-Eingabefeld für das TEXMA-ERP. Ersetzt Mantine-`NumberInput` überall dort,
// wo ein EURO-Betrag erfasst wird.
//
// Warum nicht NumberInput? Mantine nutzt `react-number-format`; ein „." kann dort
// nicht GLEICHZEITIG Tausenderpunkt UND Dezimaltrenner sein. Mit der deutschen
// Konfiguration (Tausender „.", Dezimal „,") wird „1.234,56" tastendruckweise zu
// „1,23" verstümmelt (FACH-PRICE-Bug) — ein echter 1000×-Geldfehler.
//
// Lösung: ein einfaches Textfeld, das beim Tippen den Rohtext belässt und die GANZE
// Eingabe über `parseEuroInput` (@texma/shared) eindeutig interpretiert. So sind
// „1.234,56", „1234,56", „9,90" UND „9.90" (Ziffernblock) alle korrekt. Anzeige wird
// beim Verlassen des Feldes auf „1.234,56" (de-DE, 2 Nachkommastellen) normalisiert.

import { TextInput, type TextInputProps } from "@mantine/core";
import { useEffect, useState } from "react";
import { formatEuroAmount, parseEuroInput } from "@texma/shared/money";

export interface MoneyInputProps extends Omit<TextInputProps, "value" | "onChange"> {
  /** Betrag in EURO (Float) oder "" für leer. */
  value: number | "" | null | undefined;
  /** Liefert den geparsten Euro-Betrag bzw. "" wenn das Feld leer ist. */
  onChange: (value: number | "") => void;
  /** Untere Schranke (z. B. 0) — wird beim Verlassen des Feldes erzwungen. */
  min?: number;
}

const display = (v: number | "" | null | undefined): string =>
  v === "" || v == null ? "" : formatEuroAmount(v);

const clamp = (v: number, min: number | undefined): number => (min != null ? Math.max(min, v) : v);

/** Robuste EURO-Eingabe (de-DE), die deutsche und Ziffernblock-Schreibweisen korrekt parst. */
export function MoneyInput({ value, onChange, min, onFocus, onBlur, styles, ...rest }: MoneyInputProps): JSX.Element {
  const [text, setText] = useState<string>(() => display(value));
  const [focused, setFocused] = useState(false);
  // Externe Wertänderungen (z. B. EK→VK-Automatik, Preis-Resolver) übernehmen,
  // solange der Nutzer nicht selbst im Feld tippt — sonst würde die Eingabe springen.
  useEffect(() => { if (!focused) setText(display(value)); }, [value, focused]);
  return (
    <TextInput
      {...rest}
      value={text}
      inputMode="decimal"
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        setText(raw);
        const parsed = parseEuroInput(raw);
        if (parsed === null) onChange("");
        else onChange(clamp(parsed, min));
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = parseEuroInput(text);
        if (parsed === null) { setText(""); onChange(""); }
        else { const v = clamp(parsed, min); setText(formatEuroAmount(v)); onChange(v); }
        onBlur?.(e);
      }}
      styles={{ input: { textAlign: "right", fontVariantNumeric: "tabular-nums" }, ...styles }}
    />
  );
}
