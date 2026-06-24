// Funktionale Design-Tokens fuer das INTERNE TEXMA-ERP (Skill: erp-ui-design,
// docs/erp-ui-design.md). NICHT der Anfrageshop: Navy traegt, Gruen ist Akzent,
// Signalgruen nur als punktueller Indikator — nie Flaeche/Button/Text.
// Eine Quelle fuer Farben/Abstaende/Status, damit Tabellen, Karten und Status-
// Darstellung ueber alle Ansichten identisch sind (Lastenheft Kap. 38.1).
import { createTheme, type MantineColorsTuple } from "@mantine/core";
import type { CSSProperties } from "react";

// Hinweis: Die UI nutzt durchgängig Mantine (App-Shell, Differenzierer, Reporting,
// Login). Dieses Modul ist die Token-Quelle: Farben (`T`), Status-Kodierung
// (`STATUS`/`statusOf` + `statusMantineColor`), das Mantine-Theme (`mantineTheme`)
// und der einzige verbliebene Inline-Helfer `numTd` für rechtsbündige Zahlen.

export const T = {
  bg: "#FFFFFF",
  surface: "#F5F6F8", // Karten, Zebra, Sidebar
  border: "#E2E5EA",
  text: "#0E1C36", // Navy — Werte/Fliesstext
  text2: "#5B6473", // Labels/Hilfetext
  text3: "#9AA1AD", // Platzhalter/deaktiviert
  primary: "#0E1C36", // Navy — Aktion
  primaryHover: "#1A2C4D",
  success: "#386A4E", // Forest (gedaempft, NICHT Signalgruen)
  highlight: "#34FF67", // Signalgruen NUR als Status-Dot/"live"
  green: "#2E7D52", // Ampel: im Plan
  amber: "#C77700", // Ampel: Achtung
  red: "#C0392B", // Ampel: ueberfaellig/Problem
  info: "#2563EB",
  font: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/** Geldbetrag aus Cent, de-DE. */
export const euro = (cents: number | null | undefined): string =>
  cents == null ? "—" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// ── Status / Ampel — Signal nie allein ueber Farbe (Symbol + Text doppeln) ────────
export interface StatusToken {
  color: string;
  symbol: string;
  label: string;
}
/** Einheitliche Kodierung fuer Ampel- und Soll-Ist-Status (GRUEN/GELB/ROT). */
export const STATUS: Record<string, StatusToken> = {
  ROT: { color: T.red, symbol: "●", label: "ROT" },
  GELB: { color: T.amber, symbol: "●", label: "GELB" },
  GRUEN: { color: T.green, symbol: "●", label: "GRÜN" },
};
export const statusOf = (s: string): StatusToken =>
  STATUS[s] ?? { color: T.text2, symbol: "○", label: s };
/** Mantine-Badge-Farbe je Ampel-Status (für StatusBadge-Komponenten). */
export const statusMantineColor: Record<string, string> = {
  // Ampel
  ROT: "red", GELB: "amber", GRUEN: "green",
  // Entwurf / neu / Start (neutral)
  ENTWURF: "gray", NEU: "gray", ANGELEGT: "gray", OFFEN: "gray", ERFASST: "gray",
  // In Bearbeitung / unterwegs (blau)
  IN_BEARBEITUNG: "blue", IN_PRODUKTION: "blue", KONTAKTIERT: "blue", NACHFASSEN: "blue",
  VERSANDBEREIT: "blue", VERLIEHEN: "blue",
  // Versendet / qualifiziert (indigo)
  VERSENDET: "indigo", QUALIFIZIERT: "indigo",
  // Positiv abgeschlossen (teal)
  ANGENOMMEN: "teal", KONVERTIERT: "teal", ABGESCHLOSSEN: "teal", FAKTURIERT: "teal",
  ZURUECK: "teal", BERECHNET: "teal",
  // Negativ abgeschlossen (rot)
  ABGELEHNT: "red", VERWORFEN: "red", STORNIERT: "red",
};

/** Badge-Farbe für einen Status (Fallback grau). */
export const statusColor = (s: string): string => statusMantineColor[s] ?? "gray";

// ── Mantine-Theme aus den Tokens (Navy primär, kompakte Defaults) ────────────────
const navy: MantineColorsTuple = [
  "#eef1f6", "#d6dce8", "#aeb9d0", "#8294b8", "#5f76a4",
  "#476299", "#34548a", "#27477a", "#1a3360", "#0E1C36",
];
const amber: MantineColorsTuple = [
  "#fff8e1", "#ffecb3", "#ffe082", "#ffd24d", "#fbc02d",
  "#f0a500", "#d98c00", "#C77700", "#a35f00", "#7d4900",
];
export const mantineTheme = createTheme({
  fontFamily: T.font,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  primaryColor: "navy",
  primaryShade: 9,
  defaultRadius: "sm",
  colors: { navy, amber },
  autoContrast: true, // lesbarer Text auf farbigen Flächen (Badges/Buttons)
  focusRing: "auto", // sichtbarer Fokus nur bei Tastatur (:focus-visible)
  cursorType: "pointer", // klickbare Controls fühlen sich klickbar an
  // Kompakte Datenansicht (Kap. 38.1): kleinere Basisschrift als Mantine-Default.
  fontSizes: { xs: "11px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
  headings: { fontWeight: "650", sizes: { h2: { fontSize: "20px" }, h3: { fontSize: "16px" }, h4: { fontSize: "14px" } } },
  components: {
    Table: { defaultProps: { striped: true, highlightOnHover: true, withTableBorder: true, verticalSpacing: "xs", horizontalSpacing: "sm", fz: "sm" } },
    Card: { defaultProps: { withBorder: true, radius: "md", shadow: "none" } },
    Badge: { defaultProps: { variant: "light", radius: "sm" } },
    Button: { defaultProps: { radius: "sm" } },
    Alert: { defaultProps: { radius: "md", variant: "light" } },
    Tooltip: { defaultProps: { openDelay: 300, withArrow: true } },
    // Deutsche Zahleneingabe: Dezimaltrenner = Komma, Tausender = Punkt (z. B. 1.234,56).
    NumberInput: { defaultProps: { decimalSeparator: ",", thousandSeparator: "." } },
  },
});

/** Numerische Mantine-Table.Td: rechtsbuendig + tabellarische Ziffern (Spalten richten sich aus). */
export const numTd: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
