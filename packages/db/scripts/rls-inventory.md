# RLS-Inventar (ADR 0004, Slice 3 — Kinder-Tabellen)

Klassifikation aller Prisma-Modelle für die Mandanten-RLS. Generiert/gepflegt über
`packages/db/scripts/rls-inventory.mjs` (liest das @prisma/client-DMMF). Stand: 114 Modelle
= **7 root** + **105 tenant-scoped child** + **2 global/exempt**.

Reproduzieren:

```bash
node packages/db/scripts/rls-inventory.mjs                 # Klassifikation
node packages/db/scripts/rls-inventory.mjs --sql <pfad>    # Migration-SQL erzeugen
node packages/db/scripts/rls-inventory.mjs --patch-schema  # schema.prisma ergänzen (idempotent)
```

## Regel

- **root** — Modell trägt bereits ein `tenantId`-Feld (Slice 1/2): die 7 Wurzeln
  `User, Company, Supplier, Article, Quote, Order, Invoice`. In Slice 3 ausgeschlossen.
- **global/exempt** — explizite Allowlist im Skript (`EXEMPT`), je mit Begründung. Bewusst
  **ohne** `tenantId`/RLS.
- **tenant-scoped child** — alles Übrige. ADR-Default: *„im Zweifel tenant-scoped"*.

Jedes tenant-scoped Kind bekommt `tenantId TEXT NOT NULL DEFAULT 'tenant_texma'` (FK auf
`Tenant`, `ON DELETE RESTRICT`), einen Index, `ENABLE ROW LEVEL SECURITY` und die Policy
`tenant_isolation` mit F12-Wrapping `(SELECT current_setting('app.tenant_id', true))`.
**Kein `FORCE`** (Slice-2-Schnitt; Owner-Bypass hält Dev/Migration/Seed grün — FORCE in Slice 4).

## global/exempt (2) — Begründung

| Tabelle | Warum exempt |
|---|---|
| `Tenant` | Die Mandanten-Registry selbst — Elterntabelle jedes `tenantId`-FK. Eine RLS/`tenantId` auf `Tenant` wäre selbstreferenziell und würde die Isolationskette an der Wurzel kappen. |
| `PriceGroup` | Enum-gekoppelter, global geteilter Preisgruppen-**Katalog** (`kind PriceGroupKind @unique`, 6 code-definierte Arten). Die **mandantenindividuellen** Preise liegen in den tenant-scoped Kindern (`PriceGroupPrice`, `PriceGroupPriceTier`, `CustomerPriceTier`, `CustomerSupplierPriceGroup`). Bliebe `PriceGroup` tenant-scoped, könnten mehrere Mandanten nicht dieselbe `STANDARD`-Gruppe referenzieren (der Slice-2-Test teilt sie bewusst) und die `kind`-Eindeutigkeit bräche. |

## tenant-scoped child (105)

Belege & Positionen: `QuoteLine, OrderLine, Inquiry, Lead, CrmLead, Opportunity,
CollectiveOrder, DeliveryNote, DeliveryNoteLine, CreditNote, Abschlagsrechnung, Complaint`.
Produktion: `ProductionOrder, BomItem, SubProductionOrder, TimeEntry, BomTemplate,
BomTemplateItem`. Beschaffung/WE: `PurchaseOrder, PurchaseOrderLine, PurchaseOrderLineSource,
GoodsReceipt, GoodsReceiptLine, IncomingInvoice, IncomingInvoiceLine, SupplierContact,
SupplierItem`. Bestand (F4-Ledger): `Warehouse, StockLevel, StockMove, StockReservation,
StockThreshold`. Artikel/Varianten/Preise: `Collection, MediaAsset, FinishingSpec, Variant,
VariantComponent, VariantAttribute, AxisValue, SizeRun, PriceGroupPrice, PriceGroupPriceTier,
VariantEkTier, CustomerPriceTier, CustomerSupplierPriceGroup`. Stammdaten-Kinder: `Contact,
DeliveryAddress, LogoVersion, ContactLink, CallLog`. Stickerei: `StickereiStaffel,
StickereiAusschreibung, StickereiAngebot, StickereiAngebotStaffel`. Finanzen: `OpenItem,
DunningNotice, Payment, PaymentAllocation, CashRegister, CashSale, BankConnection,
PaymentOrder, PaymentTransfer, DatevExportEntry, CostCenter, SampleLoan, SampleLoanLine,
Gutschein`. Integration/Worker: `ShopConnector, OutboxEvent, IntegrationLog,
IntegrationSetting, MailAccount`. Identity/Session: `Session, AccessLog, PortalUser,
PortalSession, ApiToken, PasswordResetToken`. GoBD/Audit: `AuditLog, ArchivedDocument,
NumberSequence`. Config je Mandant: `MarkupConfig, MarkupRule, FinishingTargetTime,
ApprovalThreshold, AppSetting, EmailTemplate, AutomationRule`. Produktivität/CRM-Umfeld:
`RecordComment, RecordActivity, RecordAttachment, Notification, Task, DueItem, CalendarEvent,
InternalMessage, NewsletterCampaign, Dashboard, DashboardItem, DashboardChart, NumberCard,
Employee, VacationRequest, UserPreference`.

Die vollständige, maschinell erzeugte Liste (`Modell → Tabellenname`) liefert das Skript auf
stdout.

### Bewusste Grenzfälle

- **Config-/Singleton-Tabellen** (`MarkupConfig` id=`GLOBAL`, `ApprovalThreshold`,
  `FinishingTargetTime`, `AppSetting`, `EmailTemplate`, `IntegrationSetting`) sind
  **tenant-scoped**: die Werte (Aufschlagsfaktor, Briefkopf, Freigabeschwellen, Sollzeiten,
  Connector-Secrets) sind mandantenindividuell. Der Default `'tenant_texma'` hält sie grün.
- **Referenz-/Katalogtabellen mit Geschäftsdaten** (`AxisValue`, `SizeRun`, `CostCenter`,
  `Warehouse`) sind **tenant-scoped** (nicht exempt): sie tragen kundenspezifische Daten
  (Farb-/Größenkatalog, Kostenstellen, Läger), anders als der reine Enum-Katalog `PriceGroup`.
- **Auth-Bootstrap** (`Session`, `PortalSession`, `PortalUser`, `PasswordResetToken`,
  `AccessLog`) ist **tenant-scoped** — konsequent zu Slice 2, das bereits `User` unter RLS
  stellte. Die „Tenant-Auflösung vor der Authentifizierung" (Session-Lookup außerhalb des
  Tenant-Kontexts) ist ein bekannter, in Slice 4 zu lösender Punkt (Subdomain/Claim); unter
  der Owner-URL (Dev/Tests/CI) greift RLS ohnehin nicht.
- **Eindeutigkeit pro Mandant** (`Order.number`, `NumberSequence @@id([key,year])`,
  `AppSetting.key` …): globale Unique-/PK-Constraints bleiben in Slice 3 **unverändert**
  (genau wie Slice 2 `number @unique` global ließ). Die Row-Isolation liefert die Policy; das
  Tenant-Scoping der Unique-Constraints ist eine additive Slice-4-Härtung.
