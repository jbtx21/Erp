# Deep Research — Vorsprung 2026: Frontend- & Backend-Muster der modernsten Plattformen

> Adversarial verifizierter Research-Report (112 Agents, 3-Voter-Verifikation je Claim; nur Findings mit
> einstimmig bestätigtem Votum). Frage: Wie setzen die modernsten ERP-/Operations-Plattformen 2025/2026
> Frontends (Premium-Design, Dichte, Keyboard-First) und Backends (RLS, Outbox, Engines, MCP/AI) um —
> und was sollte TEXMA als Nächstes übernehmen? Ergänzt ADR 0003/0004 + docs/roadmap-vorsprung.md.

## Zusammenfassung

Die belegten Muster der Vorreiter 2025/2026 zeigen zwei klare Stoßrichtungen. Im Frontend entsteht "Premium" nicht durch mehr Weißraum, sondern durch kontrollierte Dichte und weniger visuelles Rauschen (Linear-Redesign 2024), algorithmisch generierte Themes im LCH-Farbraum aus wenigen Variablen (Linear), formalisierte, benannte UI-Pattern-Kataloge inkl. FilterChip-Zeilen über Tabellen (Stripe Apps) sowie pervasive Optimistic-UI für die häufigsten Aktionen — alles direkt auf TEXMAs DocListHeader/DocFormShell/AutoTable und tRPC+React-Query übertragbar. Im Backend validieren die Referenzen TEXMAs bestehende Entscheidungen (transaktionale Outbox ohne 2PC, append-only Ledger wie ERPNexts Immutable Ledger seit v13) und benennen die nächsten Schritte: eine Inbox-Seite mit Message-ID-Deduplizierung für exactly-once processing bei den WooCommerce/Shopify-Workern, perspektivisch ein Logical-Replication-Relay statt Polling, und für ADR 0004 die RLS-Fallstricke (per-Row-Policy-Evaluation ~18x langsamer ohne InitPlan-Wrap; stiller Owner/Superuser-Bypass beim Prisma-Standard-Setup). Agentenfähigkeit ist 2025/2026 gelebte Praxis: Community-MCP-Server exponieren ERPNext (120 Tools) und Odoo rein über die vorhandene REST-API, wobei der Agent-Zugriff dieselbe RBAC-/Record-Level-Security-Schicht durchläuft wie normale Nutzer — das Muster, das TEXMA über roleProcedure/redactOrderForRole bereits besitzt und nur nach außen führen muss.

## Verifizierte Findings

### F1 · Konfidenz high · Votum 3-0

Premium-ERP-UI 2025/2026 heißt Dichte statt Deko: Linear hat im Redesign 2024 Sidebar, Tabs, Header und Panels gezielt umgebaut, um visuelles Rauschen zu reduzieren und die Hierarchie sowie Dichte der Navigationselemente zu ERHÖHEN — für TEXMA: DocListHeader/AutoTable eher verdichten und Rauschen entfernen, statt Weißraum aufzublasen.

**Beleg:** Primärquelle (Linears eigener Design-Writeup, 2024-03-28) wörtlich: "adjusted the sidebar, tabs, headers, and panels to reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements." Keine Gegenquelle gefunden; Inbox erhielt "increased density and better contrast".

**Quellen:** https://linear.app/now/how-we-redesigned-the-linear-ui

### F2 · Konfidenz high · Votum 3-0

Linear generiert seine Themes (inkl. Haupt-Light/Dark) algorithmisch im LCH-Farbraum aus nur drei Variablen (Basisfarbe, Akzentfarbe, Kontrast) statt 98 Einzelvariablen; LCH wegen Wahrnehmungsnähe und Elevations-Abstufungen — Vorlage für ein Token-System in TEXMAs Mantine-Theme (Surfaces/Elevations aus wenigen Basiswerten ableiten, High-Contrast-Themes gratis).

**Beleg:** Primärquelle: "defining just three variables: base color, accent color, and contrast, instead of having to define 98 specific variables for each theme"; LCH "one of the closest color spaces to the human eye", erlaubt "different elevations for their surfaces". Korroboriert durch Linear-Changelog 2020 und Dritte (atmos.style).

**Quellen:** https://linear.app/now/how-we-redesigned-the-linear-ui · https://linear.app/changelog/2020-12-04-themes

### F3 · Konfidenz high · Votum 3-0 (2 Claims gemergt: Pattern-Katalog + Filter-Muster, beide 3-0)

Stripe formalisiert seine Dashboard-UI als Katalog benannter Patterns (Kompositionen aus Komponenten: List, Filter Controls, Onboarding, Sign-in/out, Loading, Progress Tracking) als Grundlage jedes App-Designs; konkret für Listen: FilterChips oberhalb der DataTable, je Chip genau EIN filterbares Attribut, plus konditionaler 'Clear filters'-Link nur bei aktiven Filtern — direkt übertragbar auf TEXMAs DocListHeader-Filterzeile und einen dokumentierten DocListHeader/DocFormShell-Musterkatalog.

**Beleg:** Primärquelle (Stripe-Docs): "Patterns are the foundation of your app design"; Filter-Pattern wörtlich: "Chip components are used to filter the rows shown in a DataTable, with each chip representing one filterable attribute, such as status or tier", Clear-filters-Link "only when at least one filter is active". Scope-Hinweis: gilt formal für Stripe Apps (Third-Party-Apps im Dashboard), "verbindlich" ist leicht überzeichnet ("recommended", nur Sign-in ist mandatory).

**Quellen:** https://docs.stripe.com/stripe-apps/patterns · https://docs.stripe.com/stripe-apps/patterns/filter-controls · https://docs.stripe.com/stripe-apps/patterns/lists

### F4 · Konfidenz medium · Votum 3-0 (2 Claims gemergt, je 3-0)

Optimistic UI ist bei Linear pervasiv (Issue erscheint sofort in der Liste, API-Call läuft im Hintergrund — technisch via Local-First-Sync-Engine); die actionable Empfehlung lautet: die drei häufigsten Nutzeraktionen identifizieren und via Optimistic UI zero-latency machen, auch wenn das Backend ~500ms braucht. Für TEXMA: tRPC + React-Query onMutate-Optimistic-Updates auf die Top-Mutationen (z. B. Statuswechsel, Positionserfassung) als leichtgewichtige Adaption.

**Beleg:** Faktenkern durch Primärquelle bestätigt (Linear-CTO-Talk: alle Änderungen zuerst in den lokalen Store, sofort gerendert, Sync im Hintergrund); die 3-Aktionen/500ms-Empfehlung stammt aus einem Design-Agentur-Blog (925studios, März 2026), verbatim per Suchindex verifiziert, aber Meinungsartikel. Nuance: Linear nutzt eine volle Sync-Engine, nicht per-Mutation-Optimism — React-Query-Adaption ist Abwandlung, kein 1:1.

**Quellen:** https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026 · https://www.youtube.com/watch?v=bnOpm3a1fRE (Tuomas Artman: Linear sync engine) · https://github.com/wzhudev/reverse-linear-sync-engine

### F5 · Konfidenz medium · Votum 3-0

Umschaltbare Anzeigedichte ist ein dokumentiertes Enterprise-Tabellen-Muster: kleinere Zeilenhöhen zeigen mehr Daten ohne Scrollen, reduzieren aber Scannability und erhöhen Parsing-Fehler — erfolgreiche Data-Table-Designs (Carbon, Material, Gmail, Jira, AG Grid) lassen den Nutzer die Dichte selbst wählen. Antwort auf TEXMAs 'Dichte vs. Luft'-Frage für AutoTable: nicht global entscheiden, sondern einen Dichte-Schalter (kompakt/normal) als Nutzerpräferenz anbieten.

**Beleg:** Blog-Zitat: "Smaller row height enables users to view more data without needing to scroll, but it affects scannability and can lead to parsing errors. That is why many successful data table designs incorporate the ability to control display density." Korroboriert durch Carbon-Docs (Row-Height als Nutzerpräferenz im Table-Settings-Menü) und Material-Density-Guidance. Blog-Qualität als Ausgangsquelle, aber durch Design-System-Primärdocs gestützt.

**Quellen:** https://stephaniewalter.design/blog/essential-resources-design-complex-data-tables/ · https://www.andrewcoyle.com/blog/design-better-data-tables · https://carbondesignsystem.com/components/data-table/usage/ · https://m2.material.io/design/layout/applying-density.html

### F6 · Konfidenz high · Votum 3-0

Das Transactional-Outbox-Muster (Nachricht in derselben DB-Transaktion wie die Geschäftsdaten in eine Outbox-Tabelle schreiben) garantiert Atomizität ohne 2PC — exakt TEXMAs bestehendes OutboxEvent-Muster; die kanonische Mutation (prisma.$transaction um order.update + outboxEvent.create in prisma-shipment.repository.ts) ist im Codebase verifiziert korrekt implementiert.

**Beleg:** Quelle: "It uses a database transaction to add all of the business data changes ... and it inserts the details of the message ... into an 'outbox' table within the same database transaction." Verifier hat TEXMAs Implementierung direkt im Code geprüft. Kleiner Befund: zwei Enqueue-only-Pfade (prisma-order-status-sync.repository.ts:46, prisma-order.repository.ts:78) legen Events außerhalb einer gemeinsamen Transaktion an — dort aber ohne kolokalisierte Geschäftsmutation, kein Defekt.

**Quellen:** https://github.com/Zehelein/pg-transactional-outbox · https://microservices.io/patterns/data/transactional-outbox.html · TEXMA-Code: packages/db/prisma/schema.prisma (OutboxEvent), apps/api/src/repositories/prisma-shipment.repository.ts:81-102

### F7 · Konfidenz high · Votum 3-0 (3 Claims gemergt, je 3-0)

Nächster Backend-Schritt für TEXMA: eine Inbox-Seite bei den Konsumenten (WooCommerce/Shopify-Worker). Outbox liefert nur at-least-once delivery; exactly-once PROCESSING entsteht erst durch Deduplizierung über die eindeutige Message-ID als Primärschlüssel einer Inbox-Tabelle (bzw. idempotente Handler). Die Referenzarchitektur (kgrzybek modular-monolith-with-ddd) begründet dasselbe für modulübergreifende Events (Module teilen keine Daten → keine modulübergreifenden Transaktionen) und zeigt: die Implementierung sind nur zwei SQL-Tabellen plus ein Background-Worker — mit TEXMAs Postgres + BullMQ-Relay direkt reproduzierbar, ohne Message-Broker.

**Beleg:** Zehelein (verbatim in lib/README.md): exactly-once processing "with at least once delivery", Dedup via "unique message identifier ... as the primary key". Grzybek (verbatim in README, Section 3.7): "Modules don't share data so it is not possible nor desirable to create a transaction which spans more than one module"; "The Outbox and Inbox is implemented using two SQL tables and a background worker for each module." Unabhängig korroboriert durch event-driven.io, AWS Prescriptive Guidance, Lydtech. Wichtige Nuance: echtes exactly-once verlangt, dass Handler-Seiteneffekte transaktional mit dem Inbox-Mark erfolgen, nicht nur Insert-Dedup.

**Quellen:** https://github.com/Zehelein/pg-transactional-outbox · https://github.com/kgrzybek/modular-monolith-with-ddd · https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/ · https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

### F8 · Konfidenz high · Votum 3-0

Für das Outbox-Relay gibt es zwei belegte Strategien mit klaren Trade-offs: Logical-Replication-Listener (WAL/pgoutput, wal_level=logical) liefert sofort, in garantierter Commit-Reihenfolge, ohne Polling-Last — aber nur eine Instanz pro Replication-Slot; Polling braucht keine Sonderkonfiguration und erlaubt mehrere Instanzen, erzeugt aber DB-Last und nur schwache Ordnung über created_at. TEXMAs heutiges BullMQ-Polling-Relay ist der einfache, valide Startpunkt; bei Latenz-/Ordnungsanforderungen ist der WAL-Listener der dokumentierte Upgrade-Pfad.

**Beleg:** Trade-off-Tabelle der Quelle verbatim geprüft: "Receives new messages immediately", "Guaranteed sequential ordering same as transactions were committed", "Only a single instance can connect to the replication slot" vs. "Multiple instances can poll from the same table", "Polling ... puts load on the database", "Sequential processing only on created_at date which may not be unique". Deckt sich mit etablierter Postgres-Semantik und Debezium-Rationale.

**Quellen:** https://github.com/Zehelein/pg-transactional-outbox · https://www.postgresql.org/docs/current/logicaldecoding.html · Debezium Outbox-Router-Dokumentation

### F9 · Konfidenz high · Votum 3-0

ERPNext hat ab v13 (2021, weiterhin gültig) General Ledger UND Stock Ledger auf ein unveränderliches append-only Modell umgestellt — als Breaking Change, nicht als Option; GL-Einträge werden bei Stornierung nie gelöscht, sondern durch Umkehrbuchungen neutralisiert. Das validiert TEXMAs StockMove-Ledger und die GoBD-Regel 'Korrekturen sind Bewegungen' als Industrie-Standard des führenden Open-Source-ERP.

**Beleg:** Offizielle Doku verbatim: "A major change has been introduced in ERPNext from version 13 onwards. This changes the way Accounting Ledger (General Ledger) and Stock Ledger works." Maintainer-Ankündigung explizit als Breaking Change. Qualifikation: 'Repost Item Valuation' erlaubt Neuberechnung von Bewertungen bei rückdatierten Bewegungen — auf dem Immutable-Modell aufsetzend, keine In-Place-Mutation. Achtung: der verwandte Detail-Claim zu Umkehrbuchungen exakt 'zum Stornodatum' wurde separat 1-2 refuted — das Datums-Detail nicht übernehmen.

**Quellen:** https://docs.frappe.io/erpnext/user/manual/en/immutable-ledger-in-erpnext · https://discuss.frappe.io/t/52953 ([Breaking Change v13] Introducing Immutable Ledgers)

### F10 · Konfidenz medium · Votum 3-0 (3 Claims gemergt: ERPNext-MCP, API-First, Odoo-MCP)

MCP/AI-Agent-Anbindung an ERPs ist 2025/2026 gelebte Praxis, und API-First genügt dafür: für ERPNext existiert ein MCP-Server mit 120 Tools in 14 Kategorien (Sales 17, Purchasing 11, Inventory 9, Accounting 6, HR 12, Manufacturing 7, Analytics 17 …), der ausschließlich die vorhandene REST-API mit API-Key-Auth und einem abhängigkeitsfreien HTTP-Client nutzt (identisch für Self-Hosted und Cloud); für Odoo existiert ein community-gepflegter MCP-Server (327 Stars, v0.7.1 Juni 2026), der Claude generische Record-Tools über dem ORM gibt (search/get/create/update/delete/aggregate_records + list_models) statt handkuratierter Einzel-Endpunkte. Für TEXMA: eine MCP-Schicht über den bestehenden tRPC-Prozeduren ist der belegte, kernschonende Weg zur Agentenfähigkeit.

**Beleg:** Beide Repos direkt verifiziert (Casys-AI v2.3.1 Mai 2026: "120 tools across 14 categories", "zero-dependency Frappe REST HTTP client", "API key authentication works the same way on self-hosted and cloud instances"; ivnvxd v0.7.1 Juni 2026: vollständiges CRUD+Aggregations-Toolset, alle Tools nehmen Modellnamen als Parameter). Confidence medium statt high: beides kleine Community-Projekte (42 bzw. 327 Stars), Tool-Zahlen self-reported, Abdeckungstiefe ungleich (nur 6 Accounting-Tools). Wichtig: der Claim, es gäbe eine fertige trpc-mcp-Bibliothek für direktes tRPC→MCP-Mapping, wurde REFUTED (1-2) — TEXMA müsste die MCP-Schicht selbst bauen.

**Quellen:** https://github.com/Casys-AI/mcp-erpnext · https://github.com/ivnvxd/mcp-server-odoo · https://discuss.frappe.io/t/161198

### F11 · Konfidenz high · Votum 3-0

Sicherheitsmuster für Agent-Zugriff: Im Produktionsmodus erzwingt der Odoo-MCP-Server Odoos bestehende Access Rights und Record Rules und verlangt zusätzlich explizites Modell-Allowlisting (YOLO-Bypass-Modus explizit "never in production"). Das übertragbare Prinzip für TEXMA: AI-Agenten durchlaufen exakt dieselbe RBAC-/Record-Level-Schicht wie normale Nutzer — MCP-Tools müssen durch roleProcedure/redactOrderForRole hindurch, plus eine Allowlist der agentenfähigen Prozeduren; PRODUKTION-Redaction (keine Preise) gilt auch für Agenten.

**Beleg:** README (v0.7.1, Juni 2026) verbatim: "The MCP module respects Odoo's built-in access rights and record rules"; Standard-Modus verlangt Allowlisting unter Settings > MCP Server > Enabled Models; Warnung "Never use YOLO mode in production environments!". Caveat: HTTP-Transport hat keine eingebaute Client-Auth (Transport-Ebene, außerhalb des Claims). Gegenmuster aus dem ERPNext-MCP: roher API-Key erbt die vollen Rechte des Key-Users — 'agentenfähig' ist nicht automatisch 'sicher agentenfähig'.

**Quellen:** https://github.com/ivnvxd/mcp-server-odoo

### F12 · Konfidenz high · Votum 3-0 (2 Claims gemergt, je 3-0)

RLS-Performance-Fallstrick für ADR 0004: RLS-Policies werden pro Zeile evaluiert und Postgres cached Funktionsergebnisse dabei NICHT — PlanetScales öffentlich reproduzierbarer Benchmark (1 Mio. Zeilen, 10 Tenants) maß ~105ms ohne RLS vs. ~1,96s mit Policy-Funktionsaufruf (~18x). Die konkrete Mitigation: Funktionsaufruf in der Policy als Skalar-Subquery wrappen — USING (tenant_id = (SELECT fn())) — erzwingt einen InitPlan, der einmal pro Query statt einmal pro Zeile läuft, unabhängig von der deklarierten Volatility; das stellt ~100ms wieder her und ist als Pflicht-Idiom in TEXMAs RLS-Policies zu kodifizieren.

**Beleg:** Benchmark-Repo öffentlich, Zahlen im README exakt bestätigt (No RLS 104.957ms; VOLATILE 1.960s; STABLE 1.894s; 300 Iterationen). InitPlan-Mechanismus vom Verifier lokal reproduziert: STABLE-Funktion unwrapped 1001 Aufrufe bei einem count(*), gewrappt exakt 1 Aufruf; EXPLAIN zeigt "InitPlan 1 (returns $0)". Präzisions-Caveat: streng 'einmal pro Ausführung des äußeren Plans'; Wrap nur valide, wenn das Funktionsergebnis nicht zeilenabhängig ist. PlanetScale hat kommerziellen Anti-RLS-Bias, aber Code ist public und Mechanismus unabhängig (Supabase-Docs) bestätigt.

**Quellen:** https://planetscale.com/blog/rls-sounds-great-until-it-isnt · https://github.com/planetscale/rls-latency-benchmark · https://supabase.com/docs/guides/database/postgres/row-level-security (auth_rls_initplan-Lint) · Empirische Reproduktion des Verifiers auf PostgreSQL 16.13

### F13 · Konfidenz high · Votum 3-0

RLS-Security-Fallstrick für ADR 0004: RLS wird für die tabellenbesitzende Rolle und für SUPERUSER-Rollen STILL umgangen (keine Fehlermeldung) — im Prisma-Standard-Setup (eine DATABASE_URL für migrate und Client) ist die App-Rolle zugleich Table Owner und bekommt damit NULL Tenant-Isolation aus RLS. Pflicht-Design für TEXMA: getrennte Migrations- und Laufzeit-Rollen (Runtime-Rolle ohne Ownership/BYPASSRLS) und/oder FORCE ROW LEVEL SECURITY auf allen Tenant-Tabellen, plus ein Test, der den Bypass nachweist.

**Beleg:** Offizielle Postgres-Doku: "Superusers and roles with the BYPASSRLS attribute always bypass the row security system ... Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with ALTER TABLE ... FORCE ROW LEVEL SECURITY." Seit RLS-Einführung (9.5) stabiles Verhalten. Prisma-Footgun unabhängig belegt (Bytebase, Supabase-Docs). Ergänzung: auch BYPASSRLS-Rollen umgehen RLS (im Claim ausgelassen, kein Fehler).

**Quellen:** https://www.postgresql.org/docs/current/ddl-rowsecurity.html · https://planetscale.com/blog/rls-sounds-great-until-it-isnt · https://www.bytebase.com/blog/postgres-row-level-security-footguns/ · Prisma RLS-Client-Extension-Beispiel (nutzt Non-Owner-Runtime-Rolle)

## Einschränkungen (Caveats)

1) Abdeckungslücke gegenüber der Forschungsfrage: Zu Xentral, Odoo-18-Frontend, ERPNext-v16-UI, Katana, Unleashed und DecoNetwork/Printavo (Textilveredelungs-Branchensoftware) hat KEIN Claim die Verifikation überlebt — die Frontend-Befunde stützen sich auf die Design-Vorreiter (Linear, Stripe), nicht auf ERP-Konkurrenten; deren konkrete Beleg-/Kalkulationsmuster bleiben unbelegt. Auch zu Kalkulations-Engines und Notion gibt es keine überlebenden Claims. 2) Quellenqualität gemischt: Linear/Stripe/Postgres/ERPNext-Docs sind Primärquellen; die Optimistic-UI-Empfehlung (925studios) und das Dichte-Muster stammen aus Blogs (durch Primärquellen nur teilkorroboriert); PlanetScale ist ein Vendor mit kommerziellem Anti-RLS-Interesse (Benchmark aber öffentlich reproduzierbar und vom Verifier lokal nachgestellt). MCP-Server sind kleine Community-Projekte mit self-reported Zahlen. 3) Mehrere Fetches waren proxy-blockiert (403); Verifikation lief teils über Suchindex-Snippets statt Roh-HTML. 4) Refuted beachten: kein Beleg für 'ausschließlich asynchrone' Modul-Kommunikation im kgrzybek-Referenzrepo, kein Beleg für Linears <200ms/<100ms-Zahlen, das ERPNext-Umkehrbuchungs-Datumsdetail fiel durch, und die trpc-mcp-Bibliothek als fertiger tRPC→MCP-Weg wurde refuted — eine MCP-Schicht müsste TEXMA selbst bauen. 5) Zeitsensitivität: das MCP-Ökosystem bewegt sich schnell (Releases Mai/Juni 2026); Tool-Zahlen und Repo-Status können binnen Monaten veralten. Die Postgres-RLS- und Outbox-Muster sind dagegen stabil.

## Offene Fragen

- Wie setzen die direkten ERP-Wettbewerber (Xentral, Odoo 18 Web-Client, ERPNext v16/Espresso-UI, Katana, DecoNetwork/Printavo) ihre Listen-/Beleg-/Kalkulationsmuster konkret um — insbesondere Veredelungs-Kalkulation (Druck/Stick-Preisstaffeln), zu der kein Claim überlebte?
- Wie exponiert TEXMA seine tRPC-Prozeduren am besten als MCP-Tools, nachdem trpc-mcp als fertige Bibliothek refuted wurde — eigener MCP-Server über dem tRPC-Router (mit roleProcedure-Durchgriff und Prozedur-Allowlist) oder generisches Record-Toolset über Prisma nach Odoo-Vorbild?
- Wie interagiert das RLS-Design aus ADR 0004 konkret mit Prisma (Connection-Pooling, SET LOCAL für Tenant-Kontext, getrennte Migrations-/Laufzeit-Rollen) — und wie hoch ist der reale Overhead mit dem InitPlan-Idiom auf TEXMAs tatsächlichen Query-Mustern statt im synthetischen 10-Tenant-Benchmark?
- Lohnt sich für TEXMAs Frontend ein partieller Local-First-/Sync-Engine-Ansatz (Linears Architektur) über die leichtgewichtigen React-Query-Optimistic-Updates hinaus — und ab welcher Nutzer-/Datenmenge kippt der Trade-off?

## Widerlegte Claims (aussortiert)

- {"claim": "In der Referenzarchitektur kommunizieren Module eines modularen Monolithen ausschließlich asynchron über einen In-Memory Events Bus; direkte Methodenaufrufe zwischen Modulen sind verboten — das hält die Domänen-Nähte sauber und macht spätere Extraktion (Strangler) möglich, exakt die Richtung von TEXMAs ADR 0003.", "vote": "0-3", "source": "https://github.com/kgrzybek/modular-monolith-with-ddd"}
- {"claim": "Stornierungen löschen in ERPNext keine Ledger-Einträge mehr; stattdessen werden Umkehrbuchungen (reverse entries) zum Stornodatum erzeugt — exakt das Korrektur-als-Bewegung-Muster, das TEXMA mit dem StockMove-Ledger verfolgt.", "vote": "1-2", "source": "https://docs.frappe.io/erpnext/user/manual/en/immutable-ledger-in-erpnext"}
- {"claim": "Es existiert eine fertige Open-Source-Bibliothek (trpc-mcp), die einen bestehenden tRPC-Router direkt als MCP-Server ausliefert — d.h. ein Fastify+tRPC-Backend wie TEXMA kann seine Prozeduren ohne separate API-Schicht als AI-Agent-Tools (Model Context Protocol) exponieren.", "vote": "1-2", "source": "https://github.com/Jacse/trpc-mcp"}
- {"claim": "Linear's app loads in under 200ms and view transitions take less than 100ms, and the article frames this speed as a deliberate design decision rather than only an engineering outcome — a benchmark TEXMA could adopt for its Mantine/tRPC frontend.", "vote": "1-2", "source": "https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026"}

## Quellenverzeichnis

- {"url": "https://www.odoo.com/odoo-18-release-notes", "quality": "unreliable", "angle": "ERP-Produkt-Releases & UX-Redesigns (primär/aktuell)", "claimCount": 0}
- {"url": "https://frappe.io/framework/version-16", "quality": "unreliable", "angle": "ERP-Produkt-Releases & UX-Redesigns (primär/aktuell)", "claimCount": 0}
- {"url": "https://help.xentral.com/hc/en-us/articles/17768125546012-Release-notes-all-versions-in-2025", "quality": "unreliable", "angle": "ERP-Produkt-Releases & UX-Redesigns (primär/aktuell)", "claimCount": 0}
- {"url": "https://katanamrp.com/product-updates/", "quality": "unreliable", "angle": "ERP-Produkt-Releases & UX-Redesigns (primär/aktuell)", "claimCount": 0}
- {"url": "https://finbyz.tech/erpnext/insights/whats-new-erpnext-version-16", "quality": "unreliable", "angle": "ERP-Produkt-Releases & UX-Redesigns (primär/aktuell)", "claimCount": 0}
- {"url": "https://www.deconetwork.com/deconetwork-vs-printavo-dtf-print-shop-software/", "quality": "unreliable", "angle": "ERP-Produkt-Releases & UX-Redesigns (primär/aktuell)", "claimCount": 0}
- {"url": "https://linear.app/now/how-we-redesigned-the-linear-ui", "quality": "primary", "angle": "Premium-SaaS-Frontend-Muster (Design-Vorreiter)", "claimCount": 5}
- {"url": "https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026", "quality": "blog", "angle": "Premium-SaaS-Frontend-Muster (Design-Vorreiter)", "claimCount": 5}
- {"url": "https://docs.stripe.com/stripe-apps/patterns", "quality": "primary", "angle": "Premium-SaaS-Frontend-Muster (Design-Vorreiter)", "claimCount": 4}
- {"url": "https://stephaniewalter.design/blog/essential-resources-design-complex-data-tables/", "quality": "blog", "angle": "Premium-SaaS-Frontend-Muster (Design-Vorreiter)", "claimCount": 5}
- {"url": "https://dev.to/blockpathdev/building-command-menus-with-cmdk-in-react-45o3", "quality": "unreliable", "angle": "Premium-SaaS-Frontend-Muster (Design-Vorreiter)", "claimCount": 0}
- {"url": "https://getdesign.md/linear.app/design-md", "quality": "unreliable", "angle": "Premium-SaaS-Frontend-Muster (Design-Vorreiter)", "claimCount": 0}
- {"url": "https://planetscale.com/blog/rls-sounds-great-until-it-isnt", "quality": "blog", "angle": "Postgres-RLS-Multi-Tenancy mit Prisma (Implementierung)", "claimCount": 5}
- {"url": "https://www.bytebase.com/blog/postgres-row-level-security-footguns/", "quality": "unreliable", "angle": "Postgres-RLS-Multi-Tenancy mit Prisma (Implementierung)", "claimCount": 0}
- {"url": "https://atlasgo.io/guides/orms/prisma/row-level-security", "quality": "unreliable", "angle": "Postgres-RLS-Multi-Tenancy mit Prisma (Implementierung)", "claimCount": 0}
- {"url": "https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35", "quality": "unreliable", "angle": "Postgres-RLS-Multi-Tenancy mit Prisma (Implementierung)", "claimCount": 0}
- {"url": "https://github.com/Zehelein/pg-transactional-outbox", "quality": "primary", "angle": "Event-Driven-Backend & Outbox im modularen Monolith", "claimCount": 5}
- {"url": "https://event-driven.io/en/push_based_outbox_pattern_with_postgres_logical_replication/", "quality": "blog", "angle": "Event-Driven-Backend & Outbox im modularen Monolith", "claimCount": 5}
- {"url": "https://github.com/kgrzybek/modular-monolith-with-ddd", "quality": "primary", "angle": "Event-Driven-Backend & Outbox im modularen Monolith", "claimCount": 5}
- {"url": "https://microservices.io/post/architecture/2023/11/13/how-modular-can-your-monolith-go-part-6-transactional-commands.html", "quality": "blog", "angle": "Event-Driven-Backend & Outbox im modularen Monolith", "claimCount": 5}
- {"url": "https://docs.frappe.io/erpnext/user/manual/en/immutable-ledger-in-erpnext", "quality": "primary", "angle": "Event-Driven-Backend & Outbox im modularen Monolith", "claimCount": 5}
- {"url": "https://github.com/Jacse/trpc-mcp", "quality": "primary", "angle": "AI-Agents/MCP & API-First im ERP (Frontier + skeptisch)", "claimCount": 5}
- {"url": "https://github.com/Casys-AI/mcp-erpnext", "quality": "primary", "angle": "AI-Agents/MCP & API-First im ERP (Frontier + skeptisch)", "claimCount": 5}
- {"url": "https://github.com/ivnvxd/mcp-server-odoo", "quality": "primary", "angle": "AI-Agents/MCP & API-First im ERP (Frontier + skeptisch)", "claimCount": 5}
- {"url": "https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027", "quality": "unreliable", "angle": "AI-Agents/MCP & API-First im ERP (Frontier + skeptisch)", "claimCount": 0}
- {"url": "https://support.yoprint.com/article/263-configure-pricing-matrix-in-yoprint", "quality": "unreliable", "angle": "Vertikale Nische: Print-/Textilveredelungs-Software", "claimCount": 0}
- {"url": "https://www.printavo.com/features/", "quality": "unreliable", "angle": "Vertikale Nische: Print-/Textilveredelungs-Software", "claimCount": 0}
- {"url": "https://www.yoprint.com/", "quality": "unreliable", "angle": "Vertikale Nische: Print-/Textilveredelungs-Software", "claimCount": 0}
- {"url": "https://support.yoprint.com/category/336-supplier-vendor-catalogs", "quality": "unreliable", "angle": "Vertikale Nische: Print-/Textilveredelungs-Software", "claimCount": 0}

## Statistik

```json
{
  "angles": 6,
  "sourcesFetched": 29,
  "claimsExtracted": 64,
  "claimsVerified": 25,
  "confirmed": 21,
  "killed": 4,
  "unverified": 0,
  "afterSynthesis": 13,
  "urlDupes": 0,
  "budgetDropped": 7,
  "agentCalls": 112
}
```
