# SKILL: UI/UX-Konsistenz — TEXMA ERP (Benchmark: Xentral)

> Zweck: Verbindliches Regelwerk, das die Konsistenz-Disziplin von Xentral
> auf TEXMA überträgt. Jede Regel ist messbar (Definition of Done) und mit
> einem Audit-Snippet prüfbar. Referenz-Stack: React + Mantine UI.
> Sprache der gesamten UI: Deutsch.

---

## 0. Leitprinzip (von Xentral abgeleitet)

Xentrals Stärke ist NICHT sein Aussehen, sondern seine **Vorhersagbarkeit**:
Jede Listenseite, jede Detailseite und jede Aktion folgt demselben Muster.
Der Nutzer lernt das Muster EINMAL und wendet es überall an
(Nielsen-Heuristik #4: Consistency & Standards).

Goldene Regel: **Gleiche Rolle → gleiches Aussehen → gleicher Ort.**
Eine Komponente darf ihr Erscheinungsbild niemals je nach Seite ändern.

---

## 1. Design-Tokens (Single Source of Truth)

Alle Werte stammen aus dem zentralen Mantine-Theme (`apps/web/src/theme.ts`).
Hardcoded-Werte (inline `style`, lokale px) sind zu vermeiden; es gilt das Token.

### 1.1 Farbe
| Rolle             | Token                       | Wert         |
|-------------------|-----------------------------|--------------|
| Primary           | `navy` (theme.primaryColor) | #0e1c36 navy |
| Primary-Hover     | `--mantine-color-navy-7`    | #27477a      |
| Secondary/Ghost   | `--mantine-color-gray-1`    | #f1f3f5      |
| Destructive       | `--mantine-color-red-6`     | #fa5252      |
| Success/Status-OK | `--mantine-color-green-6`   | #40c057      |
| Warnung           | `--mantine-color-yellow-6`  | #fab005      |
| Muted-Text        | `--mantine-color-gray-6`    | #868e96      |

REGEL F-1: GENAU EINE Primärfarbe für Hauptaktionen (navy, Theme-Default).
  Keine `color="dark"`/`color="blue"`-Overrides auf primären „Anlegen/Speichern".

### 1.2 Border-Radius
| Token              | Wert        | Verwendung                 |
|--------------------|-------------|----------------------------|
| `--radius-control` | 4px         | Buttons, Inputs, Selects   |
| `--radius-card`    | 8px         | Paper, Card, Modal         |
| `--radius-badge`   | 4px         | Status-Badges (fix)        |
| `--radius-tab`     | 4px 4px 0 0 | Tabs                       |

REGEL R-1: Ein Radius pro Komponententyp.

### 1.3 Spacing (8pt-orientiert, Mantine-Skala)
xs=10px · sm=12px · md=16px · lg=20px · xl=32px
REGEL S-1: Nur Spacing-Tokens, keine freien px-Margins.

### 1.4 Typografie
| Ebene         | Size | Weight | Verwendung           |
|---------------|------|--------|----------------------|
| Seitentitel   | 16px | 650    | `<DocListHeader>` h3 |
| Sektion       | 14px | 650    | h4                   |
| Body          | 14px | 400    | Standardtext         |
| Sekundär      | 13px | 400    | Tabellen, Labels     |
| Caption/Badge | 11px | 600    | Badges (NICHT < 11px)|

REGEL T-1: Keine Schriftgröße < 11px. Badges nie in 9px.

### 1.5 Shadow
xs für Dropdowns/Popover · sm für Cards · md für Modals. Keine custom-Schatten.

---

## 2. Seiten-Architektur (das Xentral-Template)

Jede Modul-Listenseite folgt demselben Aufbau:

```
┌──────────────────────────────────────────────────────────────┐
│ <DocListHeader>  Modul · Titel (h3/16/650)   [+ Primäraktion] │
├──────────────────────────────────────────────────────────────┤
│ Filter-/Werkzeugzeile  [Suche] [Filter] [Aktion auswählen]    │
├──────────────────────────────────────────────────────────────┤
│ <AutoTable>  einheitliche Header, Status via StatusDot/Badge  │
└──────────────────────────────────────────────────────────────┘
```

REGEL P-1: Jede Route hat EINEN eigenen Seitentitel == Modulname (h3/16/650, links oben).
REGEL P-2: Primäraktion oben rechts, Primärfarbe, „+"-Präfix.
REGEL P-3 (Detail): Tab-Leiste fixe Reihenfolge; Aktions-Bereich oben rechts neben „Speichern".

---

## 3. Komponenten-Spezifikation

### 3.1 Button-Hierarchie (4 Varianten)
| Variante    | Einsatz                              |
|-------------|--------------------------------------|
| Primary     | navy, 1× pro Seite (Hauptaktion)     |
| Secondary   | gray, Nebenaktionen                  |
| Ghost/subtle| Tabellen-Inline-Aktionen             |
| Destructive | red, Storno/Löschen                  |

REGEL B-1: Statuswechsel-Buttons EINE Systematik: neutral = Secondary, Storno = Destructive.

### 3.2 StatusDot/StatusBadge (eine Komponente, zentrale Status→Variante-Map)
Fix: radius 4px, font 11px/600. Keine Ad-hoc-Badges; gleiche Status sehen überall gleich aus.

### 3.3 Filter-/Werkzeugzeile (wiederverwendbar)
Suchfeld links, Filter-Toggle, rechts „Spalten"/„Aktion auswählen". Gleiche Reihenfolge.

### 3.4 Formfelder
Höhe 36px, radius 4px, font 13px. Pflichtfeld „*" konsistent; Fehler: red-6 Border + Hint.

### 3.5 Empty / Loading / Error
- Empty: `<EmptyState>` Icon + Satz + Primär-CTA.
- Loading: Skeleton-Rows statt Vollbild-Spinner.
- Error: Inline-Alert (red-6), Klartext-DE, **KEIN** Server-Stacktrace/Pfad.

### 3.6 Modal/Dialog
radius 8px, shadow-md, Titel h4, Footer rechtsbündig:
[Abbrechen (Secondary)] [Bestätigen (Primary)] — Reihenfolge fix.

---

## 4. UX-Konsistenzregeln

- UX-1 Primäraktion oben rechts; destruktive nie direkt neben harmlosen.
- UX-2 Irreversible Aktionen (Storno/Löschen) immer mit Bestätigungsdialog.
- UX-3 Terminologie durchgängig Deutsch, ein Begriff pro Konzept.
- UX-4 Keine technischen IDs (CUIDs) in Tabellen/Labels — sprechende Nummern.
- UX-5 Kein horizontaler Seiten-Overflow. Breite Tabellen in `Table.ScrollContainer`.
- UX-6 DE-Zahlenformat (1.234,56 €), Komma-Dezimal, überall gleich.

---

## 5. Audit-Snippets (DevTools-Konsole)

```js
// A) Primärbutton-Farbkonsistenz   DoD: alle bg gleich (navy)
[...document.querySelectorAll('button,a')]
  .filter(b => /neu|anlegen/i.test(b.textContent))
  .map(b => getComputedStyle(b).backgroundColor);

// B) Badge-Stil-Streuung   DoD: genau 1 Key
(()=>{const s={};document.querySelectorAll('[class*="Badge"]').forEach(b=>{
 const c=getComputedStyle(b);const k=c.borderRadius+'|'+c.fontSize;s[k]=(s[k]||0)+1;});return s;})();

// C) Border-Radius-Wildwuchs   DoD: nur 4px (+ Tabs)
(()=>{const r={};document.querySelectorAll('main button').forEach(b=>{
 const x=getComputedStyle(b).borderRadius;r[x]=(r[x]||0)+1;});return r;})();

// D) Horizontaler Overflow   DoD: over == false
({over:document.documentElement.scrollWidth>window.innerWidth});

// E) ID-Leak in Tabellen   DoD: 0
(document.body.innerText.match(/c[a-z0-9]{24,}/g)||[]).length;
```

---

## 6. Definition of Done

- [ ] Genau 1 Primärfarbe für die Hauptaktion (Snippet A uniform).
- [ ] Badge-Stil-Streuung == 1 (Snippet B).
- [ ] Button-Radien nur Token-Werte (Snippet C).
- [ ] Kein horizontaler Overflow (Snippet D == false).
- [ ] Keine CUID/ID-Leaks im UI (Snippet E == 0).
- [ ] DocListHeader mit korrektem Modultitel + Primäraktion oben rechts.
- [ ] Empty/Loading/Error vorhanden, Fehler ohne Serverpfad.
- [ ] Terminologie & Währungsformat DE-konsistent.

---

## 7. Priorisierte Umsetzung (für Claude Code)

- P0  Eine Primärfarbe (navy-Token) für Hauptaktionen erzwingen; `color="dark"`/`"blue"`-Overrides entfernen.
- P0  Breite Tabellen in `Table.ScrollContainer` (kein Seiten-Overflow).
- P0  Server-Stacktrace aus UI-Fehlern entfernen (errorFormatter).
- P1  `DocListHeader` + Filter-/Werkzeugzeile als verbindliche Templates ausrollen.
- P1  Radius-/Spacing-Tokens festschreiben, freie px verbieten (Lint-Regel).
- P2  Empty/Loading/Error vereinheitlichen; ID-Spalten ersetzen; Badge-Mindestgröße 11px; WCAG-AA-Kontrast.

---

## Umsetzungsstand TEXMA (gepflegt)

- F-1 Primärfarbe: Theme `primaryColor: "navy"` gesetzt; 9 `color="dark"`-Overrides auf
  Primäraktionen entfernt → navy. (blue-Overrides: Folge-Audit.)
- UX-5 Overflow: `AutoTable` nutzt `Table.ScrollContainer`; Products-PIM-Tabelle gekapselt.
- §3.5 Error: errorFormatter gibt keinen Stacktrace mehr aus (`TEXMA_DEBUG_ERRORS=1` nur lokal).
- UX-6 Währung: Dashboard-Finanz-KPIs via `euro()`.
- Offen (größeres Programm): DocListHeader/Toolbar als erzwungene Templates, Lint gegen freie px,
  Badge-/Kontrast-Audit, restliche `color`-Overrides.
