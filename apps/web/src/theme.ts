// Funktionale Design-Tokens fuer das INTERNE TEXMA-ERP (Skill: erp-ui-design,
// docs/erp-ui-design.md). NICHT der Anfrageshop: Navy traegt, Gruen ist Akzent,
// Signalgruen nur als punktueller Indikator — nie Flaeche/Button/Text.
// Eine Quelle fuer Farben/Abstaende/Status, damit Tabellen, Karten und Status-
// Darstellung ueber alle Ansichten identisch sind (Lastenheft Kap. 38.1).
import { createTheme, type MantineColorsTuple } from "@mantine/core";
import type { CSSProperties } from "react";

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
  ROT: "red",
  GELB: "amber",
  GRUEN: "green",
};

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
  // Kompakte Datenansicht (Kap. 38.1): kleinere Basisschrift als Mantine-Default.
  fontSizes: { xs: "11px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
});

// ── Geteilte Stil-Bausteine (eine Vorlage ueberall) ──────────────────────────────
export const box: CSSProperties = {
  fontFamily: T.font,
  color: T.text,
  maxWidth: 1100,
  margin: "1.5rem auto",
  padding: "0 1rem",
  fontSize: 14,
};
export const th: CSSProperties = {
  textAlign: "left",
  borderBottom: `2px solid ${T.border}`,
  padding: "6px 8px",
  color: T.text2,
  fontWeight: 600,
  whiteSpace: "nowrap",
};
export const td: CSSProperties = { borderBottom: `1px solid ${T.border}`, padding: "6px 8px" };
/** Numerische Zelle: tabellarische Ziffern, rechtsbuendig (Spalten richten sich aus). */
export const tdNum: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
/** Numerische Mantine-Table.Td: rechtsbuendig + tabellarische Ziffern. */
export const numTd: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
export const card: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "1rem",
  marginTop: "1.25rem",
  background: T.bg,
};
export const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: "0.75rem" };
export const kpi: CSSProperties = { display: "inline-block", marginRight: "1.5rem", fontSize: "1.05rem" };
export const num: CSSProperties = { fontVariantNumeric: "tabular-nums" };
export const errStyle: CSSProperties = { color: T.red, margin: "0.5rem 0" };
export const inputStyle: CSSProperties = {
  fontFamily: T.font,
  fontSize: 14,
  padding: "4px 6px",
  border: `1px solid ${T.border}`,
  borderRadius: 4,
};
