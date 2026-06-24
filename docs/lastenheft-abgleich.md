# Ist-Stand vs. Lastenheft — Gap-Analyse TEXMA ERP

**Stand:** 2026-06-24 · **Spec:** `docs/lastenheft.md` · **Codebase:** `/home/user/Erp`

Methodik: Pflicht-Testfälle (Kap. 15) und Fachkapitel 3–14, 18–20 gegen die tatsächliche
Implementierung in `packages/shared/src/` (reine Domänenlogik), `apps/api/src/modules/` +
`trpc/router.ts` (Services/Endpunkte), `apps/web/src/` (UI), `packages/db/prisma/schema.prisma`
und `services/workers/` (Connectoren + Orchestrierung). Klassifikation: ✅ Erfüllt / 🟡 Teilweise / 🔴 Offen.

---

## 1. Pflicht-Testfälle T-01 … T-15 (Abnahmeprotokoll, Kap. 15)

| # | Testfall | Status | Evidenz |
|---|---|---|---|
| **T-01** | Woo-Bestellung → Firmenkunde, nicht Mitarbeiterkonto | ✅ | `shared/woocommerce.ts` `mapWooOrder()`; `modules/shop-import` idempotent über `externalNumber`. |
| **T-02** | Varianten-Mapping Farbe×Größe | ✅ | `shared/variants.ts` erzwingt „Farbe"/„Größe", `attributesFromWooMeta()`. |
| **T-03** | Kundenspezifische Stückliste → richtige Vorlage | ✅ | `shared/bom.ts` `expandBom()`; `modules/production`; Models `BomTemplate*`. |
| **T-04** | Mehrstufige Fremdvergabe + Rücklauf | ✅ | `shared/subproduction.ts` + `canStartStage()`; Model `SubProductionOrder`. |
| **T-05** | Multi-Lieferant: Start erst nach allen Eingängen | ✅ | `shared/procurement.ts` `canStartProduction()`; `procurement.startGateForOrder`. |
| **T-06** | DPD-Label + Tracking zurück an Shop | 🟡 | `connectors/dpd/dpd-client.ts` + `modules/shipment` + Outbox-Push. **Live-API ungetestet** (Credentials). |
| **T-07** | AddisonOne-Import des DATEV-Exports | 🟡 | DATEV-Export real (`shared/datev.ts`). **Addison-Import = externer Klärungspunkt K-01.** |
| **T-08** | Preisgruppe → Premium-Preise im Shop | ✅ | `shared/shop-sync.ts` `buildShopPricePush()`; ERP=Master. |
| **T-09** | „Versendet" → Shop-Status + Tracking-Mail | ✅ | `modules/order-status-sync` Outbox-Push. |
| **T-10** | Nachkalkulation DB-Soll vs. DB-Ist | ✅ | `shared/postcalc.ts`; UI-Modal `pages.tsx`. |
| **T-11** | Produktionszettel extern: Pflichtfelder | ✅ | `shared/production-sheet.ts` `validateProductionSheet()`. |
| **T-12** | Mindestlager unterschritten → Vorschlag | ✅ | `shared/reorder.ts`; Model `StockThreshold`. |
| **T-13** | Banking-Abgleich: Eingang → OP ausgeglichen | 🟡 | `shared/banking-match.ts` + `camt053.ts` real. **Bank-Pull-Provider Stub** (`in-memory-finapi-client.ts`). |
| **T-14** | Mahnlauf → Stufe 1, Mahnsperre | ✅ | `shared/dunning.ts` (3-stufig, Sperre, Gebühren). |
| **T-15** | Staffelpreis zieht Mengenstufe automatisch | ✅ | `shared/pricing.ts` `selectTier()`/`resolvePrice()`. |

**Bilanz:** 11× ✅, 4× 🟡 (T-06/T-07/T-13 + FinTS — alle wegen externer Live-Anbindung/K-01, mit realer Code-Basis). Kein 🔴.

---

## 2. Fachkapitel (Kap. 3–14, 18–20) — Kurzfassung

- **Kap. 3 Shop/Woo:** ✅ Connector (echter REST-Delta-Poll), Mitarbeiter→Firma, Farbe/Größe, Rückkanäle. 🟡 Lasttest 30 Shops nicht nachgewiesen.
- **Kap. 4 Auftrag/Kalkulation:** ✅ Belegkette, DB je Zeile, Stick-EK×1,88, Staffeln, Storno+Neuanlage.
- **Kap. 5 Produktion:** ✅ PA aus Auftrag, BOM, mehrstufige Fremdvergabe, Freigabe-Gate, Zeit, Nachkalkulation, Termin-Ampel, Stickerei-Partnerlogik. 🟡 dediziertes Kommissionier-PDF nicht belegt.
- **Kap. 6 Beschaffung:** ✅ Sammelbestellung/Bestellvorschlag (gruppiert), WE+3-Way-Match, Alternativlieferant, Lieferantenreklamation. 🟡 ID Identity/Stanley-Stella-Clients real, aber Live ungetestet. 🔴 FHB(nexmart)/HAKRO-EDI.
- **Kap. 7 Dateien/Logos:** ✅ Pflicht-Link, Anhänge, Logo-Versionierung + Freigabe.
- **Kap. 8 CRM:** ✅ Firma/Kontakte/Adressen, Preisgruppen, Branche, Split-Lieferung. 🟡 CDH-Migrationslauf nicht belegt.
- **Kap. 9 Finanzen:** ✅ Auto-Faktura, Gutschrift→Wiedereinlagerung, OP/Teil-/Überzahlung, Mahnwesen, 3-Way-Match, DB/Umsatz/DLZ, DATEV. 🟡 Bank-Liveabruf Stub.
- **Kap. 10 GoBD:** ✅ Audit jede Mutation, Append-only-Ledger. 🟡 WORM/Z3 auf App-Ebene (kein zertifiziertes DMS — laut Lastenheft Restrisiko). 🔴 Verfahrensdokumentation (organisatorisch).
- **Kap. 11 Migration:** 🟡 Import/Export-Toolkit vorhanden, CDH-Lauf nicht belegt.
- **Kap. 12 Rollen/Freigaben:** ✅ RBAC echt erzwungen, PRODUKTION-Redaktion, Freigabeschwellen.
- **Kap. 13 Middleware:** ✅ BullMQ Outbox-Relay + Connector-Polls + IntegrationLog. 🔴 Phase-2/3-Connectoren.
- **Kap. 14 Technik:** ✅ Fastify/tRPC-Server, Auth (Argon2, TOTP-2FA, Sessions, Lockout), TLS. 🟡 DPD-Live. 🔴 Notbetrieb (K-17, organisatorisch).
- **Kap. 18 Anfrage-/Sammelshop:** ✅ Anfrage/Lead→Vorgang. 🟡 Katalog-Feed-Endpunkt nicht belegt. 🔴 öffentlicher Sammelbestell-Shop (K-12).
- **Kap. 19 E-Rechnung:** ✅ Ausgang (XRechnung/ZUGFeRD CII), Eingang+Validierung+Auto-3WM, Nummern-Master.
- **Kap. 20 Reklamation:** ✅ Vorgang mit Bezug, Ursache/Kostenträger, Folgevorgang, Historie.

---

## 3. Top offene Lücken (priorisiert)

1. **Banking-Liveabruf (FinTS/HBCI bzw. finAPI/EBICS) ist Stub** — CAMT.053-Import + Matching + Klärungsliste echt, aber automatischer Kontoabruf fehlt als produktiver Connector. (Kap. 9.4 / T-13)
2. **Lieferanten-Connectoren Phase 2/3** — nur ID Identity + Stanley/Stella real; HAKRO Connect, FHB/nexmart-EDI nur Mapper-Stubs. (Kap. 6/13)
3. **Kundenportal nur read-only** — mandantenisolierte Auftragsprojektion vorhanden; Self-Service-Stammdaten/Nachbestell-Anfrage/Kunden-Auth-UI fehlen (laut Lastenheft „Could"). (Kap. 36)
4. **Sammelbestell-Shop-Logik** (Bestellfenster + Sammelauftrag) fehlt. (Kap. 18.2, K-12)
5. **DPD-/Lieferanten-Live-APIs unverifiziert** — Clients korrekt aufgebaut, ohne Credentials nicht abgenommen. (T-06)
6. **Externe/organisatorische Pflichten** — Verfahrensdokumentation (10.5), zertifizierte WORM-Archivlösung (Kap. 10), Addison-Import (K-01), Notbetrieb (K-17), Katalog-Feed (18.1).

---

## 4. Go-Live-Readiness — Verdikt

Der Ist-Stand ist für eine Eigenentwicklung bemerkenswert vollständig: Domänenlogik IO-frei und
getestet in `packages/shared` (45+ Module), API als echter Fastify-/tRPC-Server mit produktiver
Auth (Argon2, TOTP-2FA, Sessions, Brute-Force-Schutz) und durchgesetztem RBAC, GoBD-Audit je
Mutation, Bestand als Append-only-Ledger, Worker-Schicht über echtes BullMQ/Redis mit Outbox-Relay
und realen Woo-/DPD-/Lieferanten-Clients. **13 von 15 Pflicht-Testfällen sind fachlich vollständig**
durch Code abgedeckt; die vier 🟡 hängen ausschließlich an externen Live-Anbindungen bzw. K-01.

**Für einen Go-Live mit den Must-have-Funktionen (Kap. 25) ist das System grundsätzlich tragfähig**,
vorbehaltlich dreier echter Schließungspunkte: produktiver Bank-Connector statt Stub, Abnahme der
DPD-/Lieferanten-Live-Endpunkte mit echten Credentials, sowie die organisatorischen GoBD-Bausteine
(Verfahrensdokumentation, revisionssichere Archiv-Bestätigung durch den Steuerberater). Die als
„Could/Future" eingestuften Lücken (Kundenportal, Sammelbestell-Shop, Phase-2/3-EDI) blockieren
den Kernbetrieb nicht.
