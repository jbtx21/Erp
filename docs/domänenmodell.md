# TEXMA-ERP — Domänenmodell

> Stand: 2026-06-21. Prüfbare Übersicht der Entitäten, Beziehungen und Lebenszyklen
> (Gate **G5**, Bus-Faktor). **Single Source of Truth ist `packages/db/prisma/schema.prisma`** —
> dieses Dokument erklärt es, muss mit ihm konsistent bleiben (bei Schemaänderung mitziehen).

## 1. Entitäten-Cluster

**Stammdaten**
- `Company` (Firmenkunde, Preisgruppe, Zahlungsziel, Mahnsperre, Stickerei-Partner) → `Contact*`, `DeliveryAddress*`, `LogoVersion*`.
- `PriceGroup` (Kundengruppe) ← Preise; `Article` → `Variant*` (Farbe/Größe via `VariantAttribute`), `PriceGroupPrice*`.
- Textil-PIM (B18): `Collection`, `MediaAsset`, `FinishingSpec`, GTIN/Material an Article/Variant.
- `Supplier` → `SupplierItem*` (EK je Variante, Priorität).

**Vorgangskette (Vertrieb)**
- `Inquiry` (Anfrage, B20) → `Quote` (Angebot) → `Order` (Auftrag) → `OrderLine*`.
- `Invoice` (Rechnung) → `OpenItem` (Offener Posten) → `Payment`/`PaymentAllocation`; `CreditNote` (Gutschrift).

**Produktion**
- `Order` → `ProductionOrder` → `BomItem*` (Stückliste) + `SubProductionOrder*` (mehrstufige Fremdvergabe, Beistellung→Rücklauf).
- `TimeEntry*` (Zeiterfassung/Lohn), `FinishingTargetTime` (Soll-Zeiten), `AmpelStatus` (Termin-Ampel).

**Beschaffung & Lager**
- `PurchaseOrder` → `PurchaseOrderLine*` → `GoodsReceipt`/`GoodsReceiptLine*`.
- **Lager (F4):** `StockMove*` (append-only Ledger) → `StockLevel` (materialisierter HAUPT-Cache).
- `IncomingInvoice` (+ 3-Way-Match gegen PO/Wareneingang).

**Banking**
- `BankConnection` (EBICS/PSD2) → `PaymentOrder`/`PaymentTransfer*` (pain001), camt053-Abgleich gegen `OpenItem`.

**Compliance & Integration**
- `AuditLog` (append-only, before/after), `NumberSequence` (F1), `ApprovalThreshold`, `DueItem` (Wiedervorlagen),
  `OutboxEvent`/`IntegrationLog` (zuverlässige Außenkommunikation), `User`/`Session`/`AccessLog`.

## 2. Vorgangskette (Hauptfluss)
```
Inquiry ──konvertiert──▶ Quote ──angenommen──▶ Order ──▶ ProductionOrder ──▶ Shipment
  (AF)                    (AN)                  (AB)        (PA)                (Versand)
                                                  │
                                                  └──▶ Invoice (RE) ──▶ OpenItem ──▶ Payment
                                                                          │
                                                                          └─ Mahnwesen / CreditNote (GS)
```
Fremdvergabe: `ProductionOrder` → `SubProductionOrder` je Stufe (z. B. Siebdruck → Stickerei),
sequenziell mit Beistellung/Rücklauf.

## 3. Statusautomaten (F2, `packages/shared`)
**OrderStatus** (`order.ts`) — Storno aus jedem nicht-finalen Status bis VERSANDBEREIT;
keine Rückwärts-Übergänge. Nach Versand läuft die Nachkette (B9/K-26):
```
ANGELEGT → IN_BEARBEITUNG → IN_PRODUKTION → VERSANDBEREIT → VERSENDET → FAKTURIERT → ABGESCHLOSSEN
   └──────────┴───────────────┴──────────────┴──▶ STORNIERT
```

**InquiryStatus** (`inquiry.ts`, B20) — Anfrage-Funnel vor dem Angebot:
```
NEU → IN_BEARBEITUNG → ANGEBOT (→ konvertiert zu Quote) | VERWORFEN
```

**QuoteStatus** (`quote.ts`) — Angebots-Funnel:
```
ENTWURF → VERSENDET ⇄ NACHFASSEN → ANGENOMMEN | ABGELEHNT
```

**SubProductionStatus** (`subproduction.ts`) — Stufe:
```
OFFEN → BEISTELLUNG_VERSANDT → RUECKLAUF_ERHALTEN → ABGESCHLOSSEN
```
Alle drei nutzen denselben Helfer `defineMachine` (`statemachine.ts`): erlaubte Übergänge als
Tabelle, `assert()` blockiert illegale Wechsel.

## 4. Querschnitts-Invarianten
- **Geld** stets in Cent (Integer), nie Float (`money.ts`).
- **Nummernkreis-Hoheit (F1):** Belegnummern (RE/GS/AB/AN/AF/BE/LS/PA) kommen aus `NumberSequence`,
  lückenlos je Belegart+Jahr, Vergabe erst bei Finalisierung. ERP ist Master.
- **Unveränderbarkeit (G2):** finalisierte Belege werden nicht geändert (Storno/Gutschrift);
  jede Änderung erzeugt einen `AuditLog`-Eintrag (alt→neu).
- **Bestand (F4):** nur über `StockMove`; `StockLevel.qty` ist abgeleiteter Cache.
- **Buchhaltungs-Grenze (G1):** kein Hauptbuch/Buchungssatz; nur DATEV/EXTF-Export.
- **RBAC (Kap. 12):** Rolle `PRODUKTION` ohne Preis-/Kundendaten.

## 5. Konsistenz-Hinweis
Bei jeder Schemaänderung (`schema.prisma`) sind Abschnitte 1–3 hier nachzuziehen; die
Statusautomaten in §3 müssen mit den Prisma-Enums (`OrderStatus`, `QuoteStatus`) übereinstimmen.
