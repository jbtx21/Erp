# TEXMA OS — Design-Spezifikation (extrahiert aus dem Claude-Design-Handoff, Juli 2026)

Quelle: Handoff-Bundle „Moderne ERP-Interfaces und Frontends" — Primärdesign
`TEXMA OS.dc.html` (4 942 Zeilen), Begleiter `TEXMA UI Kit.dc.html`,
`Design Briefing.dc.html`, Assets `texma-logo.png` + `ABCDiatype-Regular.woff2`.
Dieses Dokument ist das Nachschlagewerk für die Umsetzung in `apps/web`
(Token-Quelle: `apps/web/src/theme.ts` + `apps/web/src/index.css`).

## Designprinzipien (Briefing 01)

1. **Navy trägt, Grün akzentuiert** — Navy `#0E1C36` für Aktion/Text/Chrome;
   Signalgrün `#34FF67` NUR punktuell (Live-Dot, Marke), nie Fläche/Button/Text.
2. **Apple-nah & premium** — Weißraum, navy-getönte weiche Schatten, große Radien,
   ABC Diatype, ruhige Typo statt technischer Fettung.
3. **Funktion vor Optik** — dichte Tabellen, Tastatur, wenige Klickwege, RBAC.
4. **Ampel nie allein über Farbe** — immer Symbol + Text (● Überfällig · ▲ Knapp · ✓ Im Plan).
5. **GoBD/DSGVO by design** — WORM-Belege, Korrektur nur Storno/Gutschrift.
6. **Konsistenz** — eine Tabelle, ein Formular-Pattern, eine Status-Kodierung.

## Schrift

| Rolle | Wert |
|---|---|
| Markenschrift | **ABC Diatype** (nur Regular lizenziert; `@font-face` mit `font-weight: 100 900` → kein Faux-Bold, Hierarchie über Größe/Farbe/Laufweite) |
| Fallback | `Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif` |
| Grund-Laufweite | `letter-spacing: .005em` (Body), Überschriften `-.01em` |
| Zahlen | `font-variant-numeric: tabular-nums`, rechtsbündig |

Typo-Skala (Briefing 03 + Prototyp):

| Stufe | Größe / Laufweite | Verwendung |
|---|---|---|
| Display | 40 / −3 % | Marketing/Briefing, im ERP ungenutzt |
| H1 Dashboard | 32 / −.8 %, weight ~505 | „Übersicht — Termin-Ampel" |
| H1 Modulseite | 26–27 / −1 %, weight ~530 | Seitentitel |
| Untertitel | 13.5, `#7A828F` | Beschreibung unter H1 |
| Section | 17 | Wizard-/Panel-Titel |
| Body | 13–15 | Fließtext, Tabellen 13 |
| Label/Feld | 10.5 uppercase, ls .05em, `#9AA1AD` | Formularlabels, Tabellenköpfe |
| Caption | 11 / +4 % | Badges, Metadaten |
| KPI-Zahl | 31 (Karten) / 21–23 (kleine KPI), tabular | MetricCards |

## Farb-Tokens

### Marke
| Token | Hex | Rolle |
|---|---|---|
| Navy | `#0E1C36` | Aktion · Text · Chrome (Primary) |
| Navy Hover | `#1A2C4D` | Hover-Zustand |
| Signalgrün | `#34FF67` | NUR Live-/Marken-Punkt (pulsierend) |
| Forest | `#386A4E` | Erfolg · „Im Plan"-Text |
| Mint | `#D4FFDF` | Erfolgs-/Live-Badge-Fläche |
| Ice | `#D4FAFF` | dezente Info-Fläche |

### Ampel & Belegstatus (funktional, immer Bg+Fg-Paar)
| Status | Fg | Bg | Symbol |
|---|---|---|---|
| Überfällig (ROT) | `#C0392B` | `#FCEBEC` | ● |
| Knapp (GELB) | `#C77700` | `#FEF4E6` | ▲ |
| Im Plan (GRÜN) | `#2E7D52` | `#D4FFDF` (Chip: `#E8F3EE`) | ✓ |
| Erfasst/Entwurf | `#495057` | `#F1F3F5` | ○ |
| Angebot | `#6741D9` | `#F3F0FF` | — |
| In Produktion | `#2563EB` | `#EAF1FE` | — |
| Veredelung / Gutschrift | `#3B5BDB` | `#EDF2FF` | — |
| Versandbereit | `#1971C2` | `#E7F5FF` | — |
| Abgeschlossen / Bezahlt | `#0C8599` | `#E6FCF5` | ✓ |
| Fremdvergabe (Orange) | `#E8590C` | `#FDECE2` | — |
| Intern (Steel) | `#34548A` | `#E9EEF6` | — |

### Flächen & Text
| Token | Hex | Rolle |
|---|---|---|
| Background | `#F5F5F7` | App-Grundfläche |
| Surface | `#F5F6F8` | Chips, Hover, Kacheln |
| Surface 2 | `#EEF0F3` | Segmented-Track, zweite Ebene |
| Karte | `#FFFFFF` | Karten/Tabellen |
| Border | `#E2E5EA` | Rahmen/Trennlinien |
| Hairline | `#F0F1F3` / `#F1F3F5` | Tabellen-Zeilentrenner |
| Text | `#0E1C36` | Werte/Fließtext |
| Text 2 | `#5B6473` | Labels/Hilfetext |
| Text 3 | `#7A828F` | sekundär |
| Text 4 | `#9AA1AD` | Platzhalter/deaktiviert (nie Information) |

### Modulfarben der Sidebar (Gruppen-Kacheln)
| Gruppe | Hex |
|---|---|
| Start | `#0E1C36` |
| CRM | `#C77700` |
| Vertrieb | `#6741D9` |
| Einkauf | `#2563EB` |
| Lager | `#0C8599` |
| Veredelung | `#E8590C` |
| Buchhaltung | `#386A4E` |
| Personalwesen | `#7A5AF8` |
| Einstellungen | `#495057` |

## Radius · Schatten · Raster · Motion

| Token | Wert |
|---|---|
| Radius Controls | 8 px (kleine Buttons/Chips 7–9) |
| Radius Felder | 10–12 px (Inputs h38 → r10) |
| Radius Karten | 14–18 px (KPI 14/18, Tabellenkarte 16–18) |
| Radius Panels | 22 px (Hero-/Chart-Panels) |
| Pillen | 20 px / 999 (Status-Badges, Filter-Chips) |
| Schatten sm | `0 1px 3px rgba(14,28,54,.08)` |
| Schatten Karte (md) | `0 6px 26px rgba(14,28,54,.05)` |
| Schatten Overlay (lg) | `0 16px 40px rgba(14,28,54,.12)` |
| Schatten Modal (xl) | `0 24px 60px rgba(14,28,54,.28)` |
| Primär-Button-Schatten | `0 2px 8px rgba(14,28,54,.22)` |
| Raster | 4-px-Basis; Karten-Padding 20–22; Inhaltsbreite max ~1120–1240 |
| Motion | Hover/Press 120–160 ms; Overlays 220–340 ms, `cubic-bezier(.22,1,.36,1)`; Seiten-Einstieg `tx-rise` (12 px hoch, .45 s); respektiert `prefers-reduced-motion` |
| Scrollbar | 10 px, Daumen `rgba(14,28,54,.16)`, r20, transparenter Track |

## App-Shell (Briefing 05 + Prototyp)

- **Sidebar 256 px** (Rail 66 px): Glas `rgba(252,252,253,.72)` + `blur(20px) saturate(180%)`,
  `border-right: 1px solid rgba(14,28,54,.07)`.
  - Kopf: TEXMA-Logo (`texma-logo.png`, Höhe 23 px) + „ERP"-Miniatur (9.5 px, ls .14em,
    `#7A828F`, linker Hairline-Divider) + Einklapp-Button (26 px, r8, Rahmen `#E2E5EA`).
  - Gruppenkopf: farbige Icon-Kachel **24×24, r7** (weißes Strich-Icon 14 px, Schatten
    `0 1px 2px rgba(14,28,54,.16)`) + Label 10.5 px uppercase 600 `#7A828F` + Chevron.
  - Eintrag: 13 px, Farbe `#0E1C36`, Einzug 34 px, r8, Hover `rgba(14,28,54,.045)`;
    **aktiv**: 3-px-Balken links in Gruppenfarbe + Fläche `rgba(14,28,54,.055)`.
  - Badge am Eintrag: Pille `#FCEBEC`/`#C0392B`, 10 px.
  - Fuß: Avatar-Kachel 34×34 r9 Navy (Initialen) + Name 12.5/Rolle 11 `#7A828F` + Settings.
  - Rail: 38×38-Kacheln in Gruppenfarbe, aktive Gruppe mit Navy-Strich links, Flyout on hover.
- **Topbar 62 px**: Glas `rgba(255,255,255,.66)` + `blur(26px) saturate(180%)`,
  `border-bottom: 1px solid rgba(14,28,54,.06)`.
  - Breadcrumb „TEXMA ERP / <Bereich>" (12.5 px, `#7A828F`, aktiver Teil navy 495).
  - Suchfeld (⌘K): h36, r9, Fläche `#F5F6F8`, Rahmen `#E2E5EA`, Text 13 `#7A828F`,
    „⌘K"-Pille (11 px, weiße Fläche, Rahmen); Hover → weiß + Rahmen `#ABB0BC`.
  - Live-Badge: Mint `#D4FFDF`, pulsierender `#34FF67`-Punkt (7 px), 11.5 px.
  - Primär-CTA „Neu": h36, r9, Navy, Schatten `0 2px 8px rgba(14,28,54,.22)`, Hover `#1A2C4D`.
- Kein großer Seiten-Header — H1 im Content. Content-Padding ~28/32 (Dashboard 40/48).

## Komponenten-Inventar (Briefing 06 → App-Bausteine)

| Design-Komponente | Spezifikation | App-Baustein |
|---|---|---|
| Modul-Kachel (Sidebar) | 24×24 r7, Gruppenfarbe, weißes Icon | `App.tsx` SideNav |
| KPI-Karte + Sparkline | weiß, r18, Schatten-Karte, p22; Icon-Kachel 38×38 r10 (Pastell-Bg + Ton-Fg); Label 10.5 up `#7A828F`; Zahl 31 tabular; Hinweis 11 `#9AA1AD` | `ui-kit.tsx` MetricCard |
| Kleine KPI-Kachel | weiß, r14, Rahmen `#E2E5EA`, p14–15; Zahl 21–23 farbig; Label 11.5 `#7A828F` | MetricCard (klein) |
| Segmentbalken (Hero) | Panel r22 + Schatten; Balken h14 r999 auf `#EEF0F3`; Segmente `#C0392B/#C77700/#2E7D52`; Legende 9-px-Dots + 12 px `#5B6473` mit fetten Zahlen | `ui-kit.tsx` SegmentBar |
| Ampel-Badge | Pille r20, 11–12.5 px, Symbol+Text, Bg/Fg-Paar | `Dashboard.tsx` AmpelBadge / StatusBadge |
| Status-Badge | Pille r20, 10.5–11 px, weight ~530, Mischschreibung | `doc-layout.tsx` StatusBadge |
| Datentabelle | Karte weiß r16–18 (Schatten o. Rahmen `#E2E5EA`), Kopf 10.5 up 600 `#9AA1AD` ls .05em mit Bottom-Border `#E2E5EA`; Zeilen 13 px, Hairline `#F0F1F3`, Hover `#F5F6F8`, **kein Zebra**; Zahlen tabular rechts | `pages.tsx` AutoTable |
| Filter-Chips | Pille h28–34 r20, Rahmen `#E2E5EA`; aktiv = Navy-Fläche + weißer Text | AutoTable-Filter/Chips |
| Buttons | Primär Navy (h36–40, r9–11, Schatten), Sekundär weiß + Rahmen, Tertiär transparent, Destruktiv `#C0392B`; Press `scale(.96)` | Mantine Button |
| Inputs | h38, r10, Rahmen `#E2E5EA`; Label 10.5 up 600 `#9AA1AD`; Fokus Navy-Rahmen + 3 px `rgba(14,28,54,.1)` | Mantine Input |
| Segmented Control | Track `#EEF0F3` r9–11 p3; aktives Segment weiß r7 + `0 1px 2px rgba(14,28,54,.1)` | Mantine SegmentedControl/Tabs |
| Switch | 42–50×24–30 r999; an = Navy-Track (Erfolg `#2E7D52`), Knopf weiß | Mantine Switch |
| Kanban-Karte | weiß r12, `0 1px 3px rgba(14,28,54,.08)`, 3-px-Border links in Ampel/Spaltenfarbe | Pipeline/Boards |
| Detail-Drawer | rechts 404 px, weiß, Schatten `-16px 0 48px rgba(14,28,54,.18)`, slide-in | Modals/Drawer |
| Cmd+K Spotlight | 610 px, r22, Schatten xl, Suchzeile 15.5 px, Fußleiste 11 px | `App.tsx` GlobalSearch |
| Leerzustand/Lock | zentrierte Kachel 52–62 px r17/18 + Titel + Hinweis | `doc-layout.tsx` EmptyState |
| Avatar-Kachel | 30–52 px, r8–14, Vollfarbe + weiße Initialen 11–16 px | Listen/Detailköpfe |

## Muster

- **Master-Detail** (Liste links / Detail rechts bzw. Drawer), **⌘K überall**,
  **Ampel-Kodierung identisch**, **Rollen-Guard** (Produktion ohne Preise),
  **Inline-Edit außer Belegen** (GoBD), Tabellen sortier-/suchbar mit tabular-nums.

## Abweichungen / bewusste Entscheidungen bei der Übersetzung

- **Kein Apple-Blau-Akzent**: `TEXMA OS v1 (Apple-blau)` ist die überholte Vorversion.
  Das Primärdesign akzentuiert mit **Navy**; `#2563EB` erscheint nur als Info-/Link-Farbe
  und Status „In Produktion".
- ABC Diatype nur Regular → `font-weight: 100 900` im `@font-face` (kein Faux-Bold);
  Fettungen greifen visuell erst im Inter-Fallback.
- Fraktionale Prototyp-Gewichte (470/505/530/560) werden auf 400/500/600 gerundet.
- Mantine-Paletten `violet/teal/indigo` sind auf die Design-Hexwerte übersteuert,
  damit `StatusBadge` (Registry in `theme.ts`) pixelgleich rendert.
- Der „Demo"-Badge der App bleibt (funktionale Aussage); der Live-Badge-Look
  (Mint + Puls-Punkt) ist dafür reserviert.
