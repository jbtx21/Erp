# ADR 0003 — Modularer Monolith mit chirurgischer Extraktion statt Microservices-Rewrite

- **Status:** akzeptiert (TEXMA / Projektleitung, „Evolvieren statt Rewrite")
- **Kontext-Leitplanken:** `docs/make-or-buy-leitplanken.md`, CLAUDE.md („modularer Monolith")
- **Folgt auf:** ADR 0001 (Auth-Externalisierung), ADR 0002 (Buy-Stack)

## Kontext

Es stand die Forderung im Raum, den bestehenden ERP als „limitierten Monolithen" zu **verwerfen**
und stattdessen eine verteilte, eventgetriebene **Microservices-Architektur** (Database-per-Service,
Kafka/RabbitMQ, Saga-Orchestrierung, gRPC) zu bauen — „seiner Zeit voraus".

Ist-Stand (verifiziert im Repo): **112 Prisma-Modelle**, 160+ abgeschlossene Aufgaben, grüne Tests,
produktive GoBD/DATEV/finAPI-Pfade. Die Architektur ist **kein** klassischer Monolith, sondern ein
**modularer Monolith mit bereits sauber geschnittenen Domänen-Nähten**:

- **Hexagonale Services + Repository-Interfaces** (Prisma- **und** In-Memory-Impl.) = Ports/Adapter.
  Jede Domäne ist logisch isoliert und ohne DB testbar.
- **`packages/shared`** = reine, IO-freie Domänenlogik (`pricing`, `money`, `statemachine`,
  `markup`/`selectStaffel`, `supplier-markup`). Der Kalkulations-Kern ist schon von IO entkoppelt.
- **`OutboxEvent` + Worker-Relay (BullMQ/Redis)** = **Transactional-Outbox** produktiv im Einsatz
  (`order.status.update`) — die eventgetriebene Naht existiert bereits.
- **`StockMove` Append-only-Ledger** = Event-Sourcing-Lite für Bestand (GoBD-konform, F4).
- **`packages/audit`** = WORM-Audit-Naht (GoBD).

## Entscheidung

**Kein Rewrite, keine verteilte Microservices-Zerlegung.** Der modulare Monolith bleibt die Basis.
Vorsprung wird durch **Schärfe im Kern** und **chirurgische Extraktion nach Bedarf** erreicht,
nicht durch verteilte Systeme.

**Begründung — warum Microservices hier ein Rückschritt wären (nicht „voraus"):**

1. **Verteilte Konsistenz als selbstgemachtes Problem.** Heute ist „Auftrag anlegen → Bestand
   reservieren → Fremdvergabe erzeugen → Audit schreiben" **eine** ACID-Transaktion
   (`prisma.$transaction`). Database-per-Service tauscht diese Garantie gegen Sagas mit
   Compensating Transactions — man *baut sich Inkonsistenz als Feature ein* und dann die
   Gegenmaßnahmen. Für **einen** Mandanten mit Dutzenden Nutzern ist das negativer ROI.
2. **Branchen-Konsens seit ~2023:** reflexhafte Microservices sind out; Teams re-monolithisieren
   (bekanntestes Beispiel: Amazon Prime Video). „Seiner Zeit voraus" 2026 = **schneller, typsicher,
   klüger** — nicht „verteilter als nötig".
3. **Make-or-Buy-Leitplanken bleiben gültig:** nur Differenzierendes selbst bauen; Verteilungs-
   Infrastruktur ist kein Differenzierer für einen Textilveredler.

**Extraktion nur nach klaren Kriterien (Strangler, nicht Big Bang):** Ein Modul wird erst dann zu
einem eigenen Service, wenn **mindestens eines** zutrifft:
(a) eigener, unabhängiger Lastpfad (CPU/Latenz), der den Request-Pfad blockiert;
(b) eigener Release-/Deploy-Takt, der den Monolith-Takt ausbremst;
(c) harte Isolationsanforderung (Sicherheit/Compliance). Die vorhandenen Ports (Repository-
Interfaces, `OutboxEvent`) sind die Extraktions-Nähte — kein neuer Schnitt nötig.

## Vorsprung-Roadmap (priorisiert, Aufwand/Wirkung)

| # | Hebel | Wirkung | Aufwand | Rewrite? |
|---|---|---|---|---|
| 1 | **Kalkulations-Engine** als isoliertes `packages/…`: Rohtextil-EK + Einrichtungs-Fixkosten + Stichzahl/Druckfläche-Staffel + Ausschuss-Toleranzfaktor, als **deklarative Regeln** (Ausbau von `MarkupRule`/`selectStaffel`). Später als Service extrahierbar (Kriterium a). | Herzstück, testbar | M | nein |
| 2 | **Postgres Row-Level-Security** für Mandanten-Isolation (nicht DB-per-Tenant) | echte Cloud-Mandantenfähigkeit | M | nein |
| 3 | **Outbox → Redis-Streams-Bus** + Idempotenz-Keys (Ausbau des bestehenden Relays) | eventgetrieben, wo es zählt | S–M | nein |
| 4 | **Kapazitäts-Plantafel** (Drag&Drop, Maschinen-Köpfe/Karussell, Veredler-Zuweisung) — einziges adversarial verifiziertes Research-Ergebnis (DecoNetwork-Muster) | MES-light Vorsprung | L | nein |
| 5 | **Frontend Phase 0** (Toast/Dialog/EmptyState-Bausteine, `window.*`-Sweep — Plan liegt fertig) | „kein 1980 mehr" | S | nein |

## Konsequenzen

- **+** Die 160+ Aufgaben funktionierende, getestete Substanz bleibt erhalten; Vorsprung entsteht
  additiv, risikoarm, jederzeit grün (CLAUDE.md-Prinzip „nach jeder Schicht grün").
- **+** Extraktion bleibt jederzeit möglich — die Ports sind da. Entscheidung ist reversibel.
- **−** Kein „großer Wurf" auf einmal; Vorsprung kommt in Scheiben (bewusst, siehe Strangler).
- **Verifikations-Notiz:** Die zugehörige Deep-Research lief in ein Org-Spend-Limit; nur der
  Plantafel-Befund (Hebel 4) ist quellenbelegt/adversarial verifiziert. Die übrige Roadmap stützt
  sich auf ERP-Domänenwissen + den verifizierten Ist-Stand des Repos, nicht auf Web-Quellen.

## Offene Punkte (Folge-Tasks)

1. Hebel 1 (Kalkulations-Engine) als eigenes `packages/`-Modul spezifizieren + aus `MarkupRule`/
   `selectStaffel` herauslösen; deklaratives Regelschema definieren.
2. Hebel 2 (RLS) — Tenant-Spalte + Policies je Kern-Tabelle, Migration handgeschrieben (CLAUDE.md).
3. Hebel 5 (Frontend Phase 0) — Plan `plane-umfangreich-…` ist umsetzungsreif.
