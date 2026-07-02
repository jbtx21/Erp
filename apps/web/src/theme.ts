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
  // ── Flaechen, gestaffelt (4 Ebenen wie das Xentral-Vorbild, in Navy) ──
  bg: "#FFFFFF",
  surface: "#F5F6F8", // Karten, Zebra, Sidebar
  surfaceAlt: "#EEF0F3", // zweite Zebra-/Layer-Ebene
  disabled: "#F0F1F3", // deaktivierte Flaeche
  border: "#E2E5EA",
  borderStrong: "#ABB0BC", // betonte Trennlinie/Rahmen
  // ── Text, 4-stufig. WCAG-AA: text/text2/text3 fuer INFORMATION (>=4.5:1 auf Weiss);
  //    text4 NUR Platzhalter/deaktiviert (Kontrast-FAIL fuer Text — nie fuer Information).
  text: "#0E1C36", // Navy — Werte/Fliesstext (≈15.3:1)
  text2: "#5B6473", // Labels/Hilfetext (≈5.9:1, PASS)
  text3: "#7A828F", // sekundaere Information (≈4.6:1, PASS) — war #9AA1AD (FAIL), korrigiert
  text4: "#9AA1AD", // NUR Platzhalter/deaktiviert, NIE Information
  // ── Aktion mit vollem Interaktions-Set ──
  primary: "#0E1C36", // Navy — Aktion
  primaryHover: "#1A2C4D",
  primaryActive: "#091324",
  onPrimary: "#FFFFFF", // expliziter Kontrast auf Brand-Flaeche (≈15.3:1, statt autoContrast zu raten)
  // ── Status-Rollen + heller Badge-Hintergrund (Flaeche), Vordergrund nur Rahmen/Symbol ──
  success: "#386A4E", successBg: "#E8F3EE", // Forest (gedaempft, NICHT Signalgruen)
  highlight: "#34FF67", // Signalgruen NUR als Status-Dot/"live"
  green: "#2E7D52", // Ampel: im Plan
  amber: "#C77700", amberBg: "#FEF4E6", // Ampel: Achtung
  red: "#C0392B", redBg: "#FCEBEC", // Ampel: ueberfaellig/Problem
  info: "#2563EB", infoBg: "#EAF1FE",
  // ── Fokus als Token (sichtbarer 3px-Ring, Tastatur) ──
  focusRing: "#0E1C36",
  focusRingShadow: "rgba(14,28,54,.20)",
  focusRingWidth: "0.1875rem",
  // ── Raster/Radius/Typo als Token (statt hartkodiert) ──
  space: "0.25rem", // 4px-Basis
  radius: "8px", // Controls-Radius (TEXMA OS: 8 Controls · 12 Felder · 18 Karten · 22 Panels)
  iconStroke: "1.1px",
  // Markenschrift ABC Diatype (nur Regular, @font-face in index.css), Fallback Inter + Apple-Stack.
  font: '"ABC Diatype", Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
  // Karten-Schatten (navy-getönt, TEXMA OS) — für Nicht-Mantine-Flächen.
  shadowCard: "0 6px 26px rgba(14,28,54,.05)",
} as const;

/** Geldbetrag aus Cent, de-DE. */
export const euro = (cents: number | null | undefined): string =>
  cents == null ? "—" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/** Datum aus ISO-String/Date, de-DE kurz (30.06.2026). Schwester von `euro` für Datumsspalten. */
export const datum = (iso: string | Date | null | undefined): string => {
  if (iso == null) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

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
  ROT: "danger", GELB: "amber", GRUEN: "forest",
  // Entwurf / neu / Start (neutral)
  ENTWURF: "gray", NEU: "gray", ANGELEGT: "gray", OFFEN: "gray", ERFASST: "gray",
  // In Bearbeitung / unterwegs (blau)
  IN_BEARBEITUNG: "sky", IN_PRODUKTION: "sky", KONTAKTIERT: "sky", NACHFASSEN: "sky",
  VERSANDBEREIT: "sky", VERLIEHEN: "sky",
  // Versendet / qualifiziert (indigo)
  VERSENDET: "indigo", QUALIFIZIERT: "indigo",
  // Angebot abgegeben (violet) — CRM-Funnel-Stufe ANGEBOT
  ANGEBOT: "violet",
  // Positiv abgeschlossen (teal)
  ANGENOMMEN: "teal", KONVERTIERT: "teal", ABGESCHLOSSEN: "teal", FAKTURIERT: "teal",
  ZURUECK: "teal", BERECHNET: "teal", GEWONNEN: "teal",
  // Zahlungsabgleich-Status (vereinheitlichter Abgleich)
  ZUGEORDNET: "teal", TEILZUGEORDNET: "amber", KLAERUNG: "danger",
  // Rechnungs-Zahlstatus
  BEZAHLT: "teal", TEILBEZAHLT: "amber",
  // Negativ abgeschlossen (rot)
  ABGELEHNT: "danger", VERWORFEN: "danger", STORNIERT: "danger", VERLOREN: "danger",
};

/** Badge-Farbe für einen Status (Fallback grau). */
export const statusColor = (s: string): string => statusMantineColor[s] ?? "gray";

/** Lesbare Labels für Status-/Enum-Werte (kein „IN_PRODUKTION" mehr in der UI). */
export const statusLabel: Record<string, string> = {
  IN_BEARBEITUNG: "In Bearbeitung", IN_PRODUKTION: "In Produktion", VERSANDBEREIT: "Versandbereit",
  VERSENDET: "Versendet", FAKTURIERT: "Fakturiert", ABGESCHLOSSEN: "Abgeschlossen", STORNIERT: "Storniert",
  ANGELEGT: "Angelegt", ENTWURF: "Entwurf", NACHFASSEN: "Nachfassen", ANGENOMMEN: "Angenommen", ABGELEHNT: "Abgelehnt",
  VERLIEHEN: "Verliehen", ZURUECK: "Zurück", KONTAKTIERT: "Kontaktiert", QUALIFIZIERT: "Qualifiziert", KONVERTIERT: "Konvertiert",
  EXTERN_VEREDLER: "Externer Veredler", EXTERN_STICK_SIEBDRUCK: "Extern Stick & Siebdruck",
  GRUEN: "Grün", NEU: "Neu", OFFEN: "Offen", ERFASST: "Erfasst", BERECHNET: "Berechnet", VERWORFEN: "Verworfen",
  ZUGEORDNET: "Zugeordnet", TEILZUGEORDNET: "Teilzugeordnet", KLAERUNG: "Klärung",
  TEXTIL: "Textil", VEREDELUNG: "Veredelung", SONSTIGE: "Sonstiges",
  // Bestandsbewegungs-Gründe (F4-Ledger) — lesbar statt rohem Enum.
  EROEFFNUNG: "Eröffnung", WARENEINGANG: "Wareneingang", VERBRAUCH: "Verbrauch", KORREKTUR: "Korrektur",
  HAUPT: "Hauptlager", SHOWROOM: "Showroom", TRANSFERDRUCK: "Transferdruck",
  // Lieferanten-Connector-Art (statt englischer Enum-Token in deutscher UI).
  MANUAL: "Manuell", ID_IDENTITY: "ID Identity", STANLEY_STELLA: "Stanley/Stella", HAKRO: "HAKRO", FHB_NEXMART: "FHB/nexmart",
};
/** Lesbare Anzeige eines Status/Enums: Map oder generischer Prettifier (Snake→Wörter). */
export const prettyStatus = (s: string): string =>
  statusLabel[s] ?? (/^[A-Z0-9_]+$/.test(s) ? s.split("_").map((w) => (w ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(" ") : s);

// ── Mantine-Theme aus den Tokens (Navy primär, kompakte Defaults) ────────────────
const navy: MantineColorsTuple = [
  "#eef1f6", "#d6dce8", "#aeb9d0", "#8294b8", "#5f76a4",
  "#476299", "#34548a", "#27477a", "#1a3360", "#0E1C36",
];
const amber: MantineColorsTuple = [
  "#fff8e1", "#ffecb3", "#ffe082", "#ffd24d", "#fbc02d",
  "#f0a500", "#d98c00", "#C77700", "#a35f00", "#7d4900",
];
// Ampel-/Status-Farben als kontrollierte Tupel statt generischer Mantine-Namen:
// Index 0 = heller Badge-Hintergrund (entspricht den *Bg-Tokens), Index 6/9 = Vordergrund.
// So erzeugt <Badge color="danger" variant="light"> automatisch redBg-Fläche + red-Text
// (Xentral-Muster --ax-bg-error-secondary + --ax-fg-error-primary, in Navy-Sprache).
const forest: MantineColorsTuple = [
  "#E8F3EE", "#cfe6da", "#aed3bf", "#86bd9f", "#63a984",
  "#4a9270", "#3e8463", "#386A4E", "#2c5640", "#1f3e2e",
];
const danger: MantineColorsTuple = [
  "#FCEBEC", "#f6d2d4", "#ec9fa3", "#e06b71", "#d44a51",
  "#cc353d", "#C0392B", "#a32c25", "#85231f", "#6b1c19",
];
const sky: MantineColorsTuple = [
  "#EAF1FE", "#cfe0fc", "#a3c4f9", "#74a5f6", "#4f8cf3",
  "#3179f0", "#2563EB", "#1d54c4", "#19479e", "#163a7d",
];
// TEXMA-OS-Statusfarben exakt aus dem Design (STATUSMAP/INVSTATUS des Prototyps):
// Angebot #6741D9 auf #F3F0FF, Abgeschlossen/Bezahlt #0C8599 auf #E6FCF5,
// Veredelung/Gutschrift #3B5BDB auf #EDF2FF. Überschreiben die generischen
// Mantine-Paletten violet/teal/indigo, damit Badges pixelgleich rendern.
const violet: MantineColorsTuple = [
  "#F3F0FF", "#e3dcfb", "#c8baf5", "#ab95ef", "#9276e9",
  "#8163e5", "#6741D9", "#5a37c2", "#4c2ea3", "#3f2687",
];
const teal: MantineColorsTuple = [
  "#E6FCF5", "#c3fae8", "#96f2d7", "#63e6be", "#38d9a9",
  "#20c997", "#0C8599", "#0C8599", "#0b7285", "#095c6b",
];
const indigo: MantineColorsTuple = [
  "#EDF2FF", "#dbe4ff", "#bac8ff", "#91a7ff", "#748ffc",
  "#5c7cfa", "#3B5BDB", "#3b5bdb", "#3451b2", "#2c4491",
];
export const mantineTheme = createTheme({
  fontFamily: T.font,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  primaryColor: "navy",
  primaryShade: 9,
  // TEXMA-OS-Rundungen: großzügig, weich.
  defaultRadius: "md",
  // Radius-Skala nach Design-Briefing: 8 Controls · 10–12 Felder · 16–18 Karten · 22 Panels.
  radius: { xs: "7px", sm: "9px", md: "11px", lg: "16px", xl: "22px" },
  // Weiche, abgestufte Schatten (navy-getönt) — sm entspricht dem TEXMA-OS-Kartenschatten.
  shadows: {
    xs: "0 1px 3px rgba(14,28,54,0.05)",
    sm: "0 6px 26px rgba(14,28,54,0.05)",
    md: "0 8px 24px rgba(14,28,54,0.10)",
    lg: "0 16px 40px rgba(14,28,54,0.12)",
    xl: "0 24px 60px rgba(14,28,54,0.28)",
  },
  colors: { navy, amber, forest, danger, sky, violet, teal, indigo },
  autoContrast: true, // lesbarer Text auf farbigen Flächen (Badges/Buttons)
  focusRing: "auto", // sichtbarer Fokus nur bei Tastatur (:focus-visible)
  cursorType: "pointer", // klickbare Controls fühlen sich klickbar an
  // Kompakte Datenansicht (Kap. 38.1): kleinere Basisschrift als Mantine-Default.
  fontSizes: { xs: "11px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
  // TEXMA-OS-Typo: H1 26px (Modulseiten), ruhige Setzung — die Laufweite kommt aus index.css.
  // ABC Diatype hat nur Regular (Faux-Bold unterdrückt); die Gewichte greifen im Inter-Fallback.
  headings: { fontWeight: "600", sizes: { h1: { fontSize: "26px", lineHeight: "1.2" }, h2: { fontSize: "18px" }, h3: { fontSize: "16px" }, h4: { fontSize: "14px" } } },
  components: {
    // TEXMA OS: Tabellen ohne Zebra — weiße Zeilen mit Hairline-Trennern + Hover #F5F6F8
    // (Feinstyling der Kopfzeile in index.css).
    Table: { defaultProps: { striped: false, highlightOnHover: true, withTableBorder: true, verticalSpacing: "xs", horizontalSpacing: "sm", fz: "sm" } },
    // Karten premium: weicher Schatten + große Rundung statt hartem 1px-Rahmen (borderless-Look).
    Card: { defaultProps: { radius: "lg", shadow: "sm" } },
    Paper: { defaultProps: { radius: "lg" } },
    // Status-/Beleg-Badges als Pille (TEXMA OS: border-radius 20, 11px, light-Fläche,
    // Mischschreibung statt Mantine-Versalien — „In Produktion", nicht „IN PRODUKTION").
    Badge: {
      defaultProps: { variant: "light", radius: "xl", fz: "11px" },
      styles: { root: { textTransform: "none", fontWeight: 500, letterSpacing: 0 } },
    },
    Button: { defaultProps: { radius: "md" } },
    Alert: { defaultProps: { radius: "md", variant: "light" } },
    Modal: { defaultProps: { radius: "lg", shadow: "xl" }, styles: { header: { paddingBottom: 8 } } },
    Menu: { defaultProps: { shadow: "md", radius: "md" } },
    Input: { defaultProps: { radius: "md" } },
    Tooltip: { defaultProps: { openDelay: 300, withArrow: true, radius: "md" } },
    // Deutsche Zahleneingabe: Dezimaltrenner = Komma, Tausender = Punkt (z. B. 1.234,56).
    // Punkt (Ziffernblock/Copy-Paste) wird ZUSÄTZLICH als Dezimaltrenner akzeptiert, damit
    // „9.90" nicht fälschlich als 990 (Tausender) interpretiert wird — sonst 100× falsche Beträge.
    NumberInput: { defaultProps: { decimalSeparator: ",", thousandSeparator: ".", allowedDecimalSeparators: [",", "."] } },
  },
});

/** Numerische Mantine-Table.Td: rechtsbuendig + tabellarische Ziffern (Spalten richten sich aus). */
export const numTd: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
