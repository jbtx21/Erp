# TEXMA ERP — Internes UI/UX (Design-System)

> Verbindliche UI/UX-Regeln für das **interne** TEXMA-ERP (Greenfield-Eigenbau, React/Vite).
> Quelle: Skill `erp-ui-design`. Tokens sind in `apps/web/src/theme.ts` kodiert (eine Quelle).
> **Nicht** für den Anfrageshop `anfrage.texma-gmbh.de` — dafür gilt `texma-design`.
> Verzahnt mit Lastenheft Kap. 12 (Rollen), Kap. 35 (Ampel), Kap. 38 (UI/UX).

## 0. Worum es geht — und worum NICHT

Internes Werkzeug für sechs Mitarbeitende (vier Innendienst, zwei Produktion). Maßstab ist
**Effizienz und Akzeptanz**, nicht Optik. Ein einziger ablehnender Nutzer blockiert ein
Sechstel des Betriebs.

| | Anfrageshop (`texma-design`) | Internes ERP (dieser Skill) |
|---|---|---|
| Zweck | Kunden gewinnen, Marke zeigen | Aufträge schnell abwickeln |
| Dichte | luftig, viel Weißraum | kompakt, viele Daten pro Screen |
| Farbe | Signalgrün/Pastelle als Flächen | neutrale Basis, Farbe nur funktional |
| Ton | konsumig, du-Form | knapp, Fachbegriffe |
| Erfolg = | „sieht hochwertig aus" | „Aufgabe in wenigen Schritten erledigt" |

## 1. Komponenten-Bibliothek — Mantine (entschieden)

**Mantine** ist gewählt und eingezogen (`@mantine/core` + `@mantine/hooks`, React 18).
Begründung: fertige dichte Datenkomponenten (Table, Forms+Validierung, Inputs, Tabs, Badge),
gute Tastatur-/A11y-Defaults, deutsch lokalisierbar, **kein Tailwind nötig** — passt zum Stack.

- Provider + Theme: `main.tsx` (`MantineProvider`) mit `mantineTheme` aus `theme.ts` (Navy primär,
  Amber-Palette, kompakte `fontSizes`). Stil-Import: `@mantine/core/styles.css`.
- **EINE** Lib konsequent, nicht mischen (kein shadcn/Tailwind parallel).
- Migriert: App-Shell (`Tabs`/`Table`/`Button`) + Differenzierer (`Card`/`Table`/`Badge`/`NumberInput`).
  **Noch offen:** `Reporting.tsx`, `Login.tsx`, `charts.tsx`.
- Hinweis: nur den **aktiven** Tab mounten (kein `Tabs.Panel`-keepMounted) — sonst feuern inaktive
  Ansichten Queries, die der tRPC-Client mitbatcht (ein Fehler reißt sonst die ganze Antwort mit).

## 2. Funktionale Design-Tokens (`apps/web/src/theme.ts`)

Navy trägt, Grün ist Akzent — nicht Fläche. Signalgrün NUR als punktueller Indikator.

| Rolle | Wert | Einsatz |
|---|---|---|
| Hintergrund | `#FFFFFF` | Grundfläche |
| Fläche alt | `#F5F6F8` | Karten, Zebra, Sidebar |
| Rahmen | `#E2E5EA` | Borders, Trennlinien |
| Text primär | `#0E1C36` | Navy — Werte/Fließtext |
| Text sekundär | `#5B6473` | Labels/Hilfetext |
| Text tertiär | `#9AA1AD` | Platzhalter/deaktiviert |
| Primär (Aktion) | `#0E1C36` | Navy; Hover `#1A2C4D` |
| Erfolg | `#386A4E` | Forest (gedämpft, NICHT Signalgrün) |
| Highlight | `#34FF67` | Signalgrün NUR als Status-Dot/„live" — nie Fläche/Button/Text |
| Status Grün | `#2E7D52` | Ampel: im Plan |
| Status Amber | `#C77700` | Ampel: Achtung |
| Status Rot | `#C0392B` | Ampel: überfällig/Problem |
| Info | `#2563EB` | Hinweise/Links |

**Ampel (Kap. 35):** über alle Ansichten identisch kodiert; Farbe nie allein — immer mit Symbol
oder Text doppeln (Farbschwäche, Druck, Werkstattlicht). Im Code: `STATUS`/`statusOf` +
`StatusTag` (Symbol + Text).

**Typografie:** UI-Font Inter/System-Stack; Basisgröße **13–14 px** in Datenansichten;
Zahlen/Beträge/Mengen `font-variant-numeric: tabular-nums`, rechtsbündig (`tdNum`). ABC Diatype
ist Marken-Font fürs Kundenfrontend — intern nicht nötig.

## 3. Layout & Patterns

- **App-Shell:** persistente linke Modul-Nav + schmale Top-Bar (Suche, Nutzer/Rolle). Keine großen Header.
- **Master-Detail** für Aufträge/Belege/Kunden: Liste + Detail ohne Vollseiten-Reload.
- **Datentabellen** (Herzstück): dicht, sortier-/filterbar, Spalten ein-/ausblendbar (Kap. 38.1),
  Sticky-Header, Zeilen-Aktionen direkt; bei Hunderten Zeilen virtualisieren; Zebra dezent (`#F5F6F8`).
- **Formulare:** Inline-Validierung, logische Tab-Reihenfolge, Pflichtfelder markiert, Speichern per Tastatur.
- **Produktionsansicht:** reduzierter Modus, Touch-Targets ≥ 44 px, **keine Preis-/Kundendaten** (Kap. 12),
  Status-/Zeiterfassung, tablet-/touchtauglich ab 390 px.
- **Bestätigungen sparsam:** nur bei kritischen, schwer umkehrbaren Aktionen (Storno, Freigabe).

## 4. Dichte & Tastatur

- Kompakte Abstände. Häufige Aktionen per Tastenkürzel (neuer Auftrag, Speichern, Suche fokussieren).
- Globale Suche prominent, fehlertolerant, Ergebnis < 3 s (Kap. 26).

## 5. Don'ts

- Kein Signalgrün als Fläche/Button/Text; keine Pastelle als Chrome.
- Keine Pictogramme/Hero-Sektionen/X-Muster — Anfrageshop-Inventar.
- Keine Marketing-Copy/du-Form. Knappe ERP-Texte mit TEXMA-Fachbegriffen.
- Keine zwei UI-Bibliotheken im selben Repo. `texma-design` nicht auf ERP-Oberflächen.

## 6. Pflicht-Gates (vor Commit)

- [ ] Konsistenz: gleiche Komponente/gleiches Pattern für gleiche Aufgabe (eine Tabelle, ein Formular-Pattern).
- [ ] Tastatur: Auftragserfassung vollständig ohne Maus.
- [ ] Produktion: reduzierte Ansicht bei 390 px/Tablet, große Targets, keine Preise/Kundendaten.
- [ ] Datenmenge: Tabellen mit Hunderten Zeilen flüssig; Spalten richten sich aus (tabular-nums).
- [ ] Status/Ampel: Farbe + Symbol/Text, über alle Ansichten identisch.
- [ ] Eine Lib: keine gemischten UI-Frameworks.
