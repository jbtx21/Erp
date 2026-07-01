# Vorsprung-Roadmap — „alles greift ineinander"

Konkretisiert die Hebel aus **ADR 0003** (modularer Monolith, chirurgische Extraktion) zu einer
**sequenzierten, abhängigkeits-bewussten** Roadmap. Leitgedanke: **eine** Kalkulations-Engine als
Nabe; alle anderen Stränge docken an ihren In-/Outputs an. Nach jeder Scheibe grün (CLAUDE.md).

## Die Nabe: warum alles an der Kalkulations-Engine hängt

```
   Stammdaten-EK                 Regeln                         Belege                Folge
 ┌───────────────┐        ┌──────────────────┐        ┌──────────────────┐      ┌──────────────┐
 │ Rohtextil-EK  │        │ Stick-EK-Staffel │        │ Angebot/Auftrag  │      │ Produktion   │
 │ (SupplierItem)│──────► │  (3 Stickereien) │──────► │  Positionen (VK, │────► │ Fremdvergabe │
 │               │        │ Einrichtung <10  │  VK je │  EK, DB je Menge)│      │ (SubProd.)   │
 │ Aufschlag     │        │ MarkupRule/      │  Menge └────────┬─────────┘      └──────┬───────┘
 │ (MarkupRule)  │──────► │ selectStaffel    │                 │                       │
 └───────────────┘        └──────────────────┘                 ▼                       ▼
        ▲  KALKULATIONS-ENGINE (packages/veredelung-engine)   Belegversion. (3.2)   Plantafel (Hebel 4)
        │                                                     Folgebeleg (3.5)      Outbox→Sync
   RLS-Mandant (Fundament, quer zu allem)
```

Lesart: Wer die Engine sauber baut, bekommt **Angebot, Auftrag, Nachkalkulation, Beleg-Durchschlag
und Fremdvergabe-EK gratis konsistent** — weil alle dieselbe eine Quelle nutzen. Baut man sie nicht,
bleibt die Logik über Positionen/Repos verstreut (heutiger Zustand).

## Domänen-Fakten (bestätigt, fließen als Regeln in die Engine)

- **Keine eigene Stickmaschine.** Stick-**EK** kommt von **3 Stickereien** und wird ins ERP gepflegt
  (heute: `SupplierItem` + EK-Staffel `StickereiStaffel`/`VariantEkTier`). Der VK = EK × Aufschlag
  (`MarkupRule`/`selectStaffel`) — bereits vorhanden.
- **Einrichtungskosten NUR bei < 10 Teilen.** Eine deklarative Stück­zahl-Schwellenregel der Engine
  (kein Sonderfeld je Position). Ab 10 Teilen: Einrichtung = 0.
- **Genau ein Aufschlag je Lieferant × Kundengruppe** (Preis-Overhaul P1, erledigt).

## Phasen (sequenziert, mit Abhängigkeiten)

### Phase A — Fundament: RLS-Mandantenfähigkeit  *(ADR Hebel 2, quer)*
**Entscheidung:** **voll umfänglich** (nicht nur dünne Naht). `tenantId` auf allen Kern-Tabellen +
Postgres-**Row-Level-Security-Policies** + Tenant-Kontext im Request (Session/JWT → `SET app.tenant`).
**Orthogonal zur Engine** (die ist IO-frei) → parallelisierbar; blockiert Phase B nicht. Aufwand L.
Reihenfolge: Schema/`tenantId` additiv + Backfill Default-Tenant → Policies aktivieren → Repos/Context
durchreichen. Handgeschriebene Migration (CLAUDE.md).

### Phase B — Kern: Veredelungs-Kalkulations-Engine  *(ADR Hebel 1)*  **← Start hier**
Reine, IO-freie Domäne in `packages/` (Muster wie `packages/shared`), testbar ohne DB.
- **B1** `packages/veredelung-engine` anlegen; Eingabe-DTO (Rohtextil-EK, Stick-EK-Staffel je
  Stickerei, Menge, Aufschlag-Kontext) + Ausgabe (VK/EK/DB je Menge). Reiner Resolver, baut auf
  `selectStaffel`/`resolveSupplierVk`/`MarkupRule` auf. **Unit-Tests zuerst.**
- **B2** Regel „Einrichtungskosten < 10 Teile" deklarativ + Ausschuss-Toleranzfaktor (optional).
- **B3** Bestehende Aufrufer (`pricing.service`, `stickerei.service`, Positions-Durchschlag)
  auf die Engine umstellen — Strangler: alt grün halten, dann umlegen.
- **B4** Stammdaten-Pflege-UX „EK der 3 Stickereien" schärfen (im Preis-Center, existiert).
**Abhängig von:** nichts Neuem. **Liefert an:** Belege, Nachkalkulation, Fremdvergabe. Aufwand M.

### Phase C — Belege bauen auf der Engine auf  *(offene Tasks 3.2–3.5)*
- **C1 (3.2) Belegversionierung** — Snapshot je Belegstand (GoBD-nah; Engine-Ergebnis wird pro
  Version eingefroren). **Abhängig von B** (sonst versioniert man inkonsistente Preise).
- **C2 (3.5) Folgebeleg-Pfade** — Angebot→Auftrag→Lieferschein→Rechnung mit Preis-Übernahme aus der
  Version. **Abhängig von C1.**
- **C3 (3.3) Belegvorlagen** + **C4 (3.4) Layout-Spezialfelder** — UI/Print, **unabhängig von B**,
  parallel möglich. Aufwand je S–M.

### Phase D — Produktion: Kapazitäts-Plantafel  *(ADR Hebel 4)*
Drag&Drop-Plantafel über `ProductionOrder`/`SubProductionOrder` (Veredler-Zuweisung, Reihenfolge,
Termin). Einziger web-verifizierter Research-Befund (DecoNetwork-Muster). **Abhängig von** nichts
Hartem, aber sinnvoll **nach B/C**, weil Aufträge dann sauber mit Terminen/EK ankommen. Aufwand L.

### Phase E — Integrationsnaht schärfen  *(ADR Hebel 3)*
`OutboxEvent` → Redis-Streams-Bus + Idempotenz-Keys; danach optional EDI/EDIFACT-Adapter im
bestehenden Connector-Muster. **Abhängig von** stabilen Bel/Status-Events (nach C). Aufwand S–M → L.

## Reihenfolge (empfohlen)

**B → C1 → C2 → (C3/C4 parallel) → D → E**, mit **A** als früh eingezogene dünne Naht.
Frontend Phase 0 ist **erledigt** (Toast/Dialog/Panel/EmptyState, `window.*`-Sweep = 0).

## Prinzipien (unverändert)
- Nach jeder Scheibe: `pnpm build`/`typecheck`/`test` grün, committen, pushen.
- Additiv/Strangler; Geld in Cent; jede Mutation auditiert; USt zentral; Externes über Outbox.
