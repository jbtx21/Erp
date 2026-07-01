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
        ▲  PREIS-PFAD IM BESTAND (PriceGroupPriceTier + VariantEkTier)  Belegversion.(3.2) Plantafel(4)
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
**Entscheidung:** **voll umfänglich** — Design festgeschrieben in **ADR 0004** (Postgres Row-Level-
Security, `Tenant`-Modell, `tenantId` je Tabelle, Policies `tenantId = current_setting('app.tenant_id')`,
Tenant-Kontext pro Request via Prisma-Extension `SET LOCAL`). **Phasenweiser, grün-haltender Rollout:**
Slice 1 Fundament (additiv, nullable, Backfill, Extension — keine erzwingenden Policies) → Slice 2
Enforcement Wurzeln → Slice 3 Kinder-Tabellen (skriptgeneriert über DMMF) → Slice 4 Härtung
(eigene App-Rolle ohne BYPASSRLS). Orthogonal zur Domänenlogik (ADR 0003). Aufwand L (mehrere Slices).
Siehe `docs/adr/0004-rls-mandantenfaehigkeit.md`.

### Phase B — Veredelung im BESTEHENDEN Modell schärfen  *(revidiert)*
**Entscheidung (nach Logik-Prüfung):** KEINE separate Kalkulations-Engine. Der Bestand ist bereits
EIN Pfad: Veredelung (Stick UND Druck) wird als Katalog-Artikel gespeichert — VK-Staffel als
`PriceGroupPriceTier` (STANDARD), EK-Staffel als `VariantEkTier`, EK extern als `SupplierItem`.
Beleg-Preis über `buildStaffelLadder`/`resolveBasePrice`. Eine separate `EK×Faktor`-Engine wäre
Fremd-Logik gewesen (VK wird gespeichert, nicht zur Laufzeit gerechnet) → **zurückgenommen**.
Nur zwei echte Lücken werden im Bestand geschlossen:
- **B-Fix1** `resolveBasePrice`/`pricing.resolve`: STANDARD-Staffel als Basis für ALLE Kunden
  (Veredelung kennt keine Kundengruppen). Heute greift die Staffel nur im Ladder, nicht im
  Einzelpreis-Resolver → Nicht-STANDARD-Kunden bekämen im Hint den falschen Preis.
- **B-Fix2** Regel „Einrichtungskosten nur < 10 Teile": Feld `einrichtungCents` am Veredelungs-
  artikel + Beleg-Regel (Menge < 10 → Einrichtung als Zuschlag/Position). Kein neues Rechenwerk.
**Abhängig von:** nichts Neuem. **Liefert an:** Belege, Nachkalkulation, Fremdvergabe. Aufwand S–M.

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
