# ERPNext-Tiefenabgleich gegen Lastenheft v3.4 + bisherigen Bau

> **Art:** Gap-Analyse, **kein** Implementierungs-Sprint. Es wurde nichts am Bau geändert,
> kein ERPNext-Code übernommen. Output ist dieser Bericht; was gebaut wird, entscheidet ein
> separater Schritt.
>
> **Methodik:** ERPNext (`frappe/erpnext`, `master`) wurde real sparse geklont
> (`erpnext/{selling,buying,stock,manufacturing,subcontracting,accounts,crm}`) und die echten
> DocType-JSONs gelesen. Jede ERPNext-Aussage ist mit **Dateipfad** belegt (Pfade relativ zur
> Repo-Wurzel des Klons). Bau-Aussagen referenzieren `packages/db/prisma/schema.prisma:<Zeile>`
> bzw. `packages/shared/src/*`. Richtung: **Lastenheft ist die Wahrheit** — ERPNext ist nur
> Referenz für bewährte Strukturen, kein Soll.
>
> **Lizenz:** ERPNext ist GPLv3. Gelesen wurden Struktur/Felder/Beziehungen als Referenz;
> übernommen wurde **kein Code, keine Funktion, kein Snippet**.

---

## Schritt 1 — IST-Zustand des Baus (Spalte C)

Relevante Entitäten (Auszug, `packages/db/prisma/schema.prisma`):

| Bereich | Modelle | Kernfelder / Status |
|---|---|---|
| Stammdaten | `Article` (227), `Variant` (299), `VariantAttribute` (324) | `VariantAttribute{name,value}` als freie Strings ("Farbe"/"Größe") |
| Preise | `PriceGroup` (84), `PriceGroupPrice` (336), `PriceGroupPriceTier` (349), `CustomerPriceTier` (363) | Mengenstaffel via `minMenge`; Präzedenz Kunde>Gruppe>Flat (`pricing.ts`) |
| Kunde/Portal | `Company` (94), `Contact` (127), `PortalUser` (510), `ShopConnector` (443) | `ShopConnector.companyId` (T-01); `PortalUser` isoliert, je 1 `companyId` |
| Vertrieb | `Inquiry`, `Lead`, `Quote` (475), `Order` (603) | Quote-Status …`ABGELEHNT` + `gueltigBisAm` + `verlustgrund` (B8); Order …`FAKTURIERT`/`ABGESCHLOSSEN` |
| Produktion | `ProductionOrder` (677), `BomItem` (691), `BomTemplate` (661), `TimeEntry` (722) | auftragsspezifische Stückliste; **kein** BOM-Master/Routing/JobCard |
| Fremdvergabe | `SubProductionOrder` (702) | `beistellMenge`/`ruecklaufMenge`/`lohnCents` **aggregiert am Kopf**; `sequence` (mehrstufig) |
| Bestand | `StockMove` (1062, append-only), `StockLevel` (1035) | Gründe inkl. `MUSTER`; **kein** Beistell-/Rücklauf-Grund |
| Finanzen | `Invoice`/DATEV-Export, `einvoice.ts` (XRechnung/ZUGFeRD) | operative Buchhaltung, **kein** Hauptbuch (G1) |

Getestet/dokumentiert: Audit-Trail append-only (`packages/audit`), gapless Nummernkreis
(`NumberSequence`, F1), Verfahrensdokumentation (GoBD), Failover-Runbook (B17).

---

## Schritt 2 — ERPNext-Referenzstrukturen (Spalte A, beleggestützt)

### 2.1 Subcontracting / Lohnveredelung (das Herzstück für T-04)
ERPNext trennt **Kopf**, **Fertigwaren-Position** und **beigestelltes Rohmaterial** in
eigene DocTypes — und führt die Beistell-Mengen **auf Rohmaterial-Zeilenebene**:

- **`subcontracting_order`** (`erpnext/subcontracting/doctype/subcontracting_order/subcontracting_order.json`):
  Kopf mit `supplier`, `items` (Table→Subcontracting Order Item), `service_items`,
  `supplied_items` (Table→Subcontracting Order Supplied Item), `status`
  (`Draft|Open|Partially Received|Completed|Material Transferred|Partial Material Transferred|Cancelled|Closed`),
  `per_received` (Percent).
- **`subcontracting_order_supplied_item`** (`…/subcontracting_order_supplied_item/…json`) — **die 4 Beistell-Mengen je Rohmaterial:**
  `required_qty`, `supplied_qty`, `consumed_qty`, `returned_qty`, dazu `total_supplied_qty`,
  `stock_reserved_qty`, `rm_item_code` (Link→Item), `bom_detail_no`.
- **`subcontracting_receipt`** (`…/subcontracting_receipt/…json`): Wareneingang/Rücklauf,
  `is_return`, `return_against`, `per_returned`, `supplied_items` (Table→Subcontracting Receipt Supplied Item).
- **`subcontracting_receipt_supplied_item`** (`…/subcontracting_receipt_supplied_item/…json`):
  `required_qty`, `consumed_qty` (reqd), `available_qty_for_consumption`, `current_stock`.
- **`subcontracting_order_item`** (`…/subcontracting_order_item/…json`): `qty`, `rate`, `bom`
  (Link→BOM), `received_qty`, `returned_qty`, `service_cost_per_qty`, `rm_cost_per_qty`, `job_card`.
- **`subcontracting_bom`** (`…/subcontracting_bom/…json`): `finished_good`/`finished_good_bom`
  + `service_item`/`service_item_qty` — verknüpft Fertigteil-BOM mit der Lohn-Dienstleistung.
- Legacy-Pfad identisch in `buying`: `erpnext/buying/doctype/purchase_receipt_item_supplied/…json`
  (`required_qty`, `consumed_qty`).

**Kernidee:** `supplied_qty = consumed_qty + returned_qty` wird je Rohmaterial abgeglichen;
Differenzen (Schwund/Ausschuss) werden sichtbar. Status macht „Material transferiert" vs.
„Rücklauf erhalten" explizit.

### 2.2 Preisfindung & Staffel
- **`pricing_rule`** (`erpnext/accounts/doctype/pricing_rule/pricing_rule.json`): Mengenstaffel über
  `min_qty`/`max_qty`, Zielgruppe via `applicable_for` (`Customer|Customer Group|…`) + `customer`,
  Wirkung `rate_or_discount` (`Rate|Discount Percentage|Discount Amount`), dazu generische
  Mächtigkeit: `mixed_conditions`, `is_cumulative`, `price_or_product_discount` (Gratisartikel),
  `coupon_code_based`.
- **`item_price`** (`erpnext/stock/doctype/item_price/item_price.json`): **flach** je
  `price_list`+`customer`+`valid_from/valid_upto` — **kein** `min_qty` (Staffel läuft NICHT hier,
  sondern über `pricing_rule`).

### 2.3 Varianten
- **`item`** (`erpnext/stock/doctype/item/item.json`): `has_variants`, `variant_of` (Link→Item),
  `variant_based_on` (`Item Attribute|Manufacturer`), `attributes` (Table→Item Variant Attribute).
- **`item_attribute`** (`…/item_attribute/…json`): Attribut-**Stammdaten** mit `attribute_name`,
  Wertetabelle `item_attribute_values`, optional `numeric_values`+`from_range/to_range/increment`.
- **`item_attribute_value`** (`…/item_attribute_value/…json`): `attribute_value` + `abbr`
  (Kürzel für die SKU-Generierung).

### 2.4 Verkauf / CRM
- **`quotation`** (`erpnext/selling/doctype/quotation/quotation.json`): `valid_till`,
  `status` (`Draft|Open|Replied|Partially Ordered|Ordered|Lost|Cancelled|Expired`),
  `order_lost_reason` + `lost_reasons` (Table MultiSelect→Quotation Lost Reason Detail),
  `competitors`.
- **`sales_order`** (`erpnext/selling/doctype/sales_order/sales_order.json`): `delivery_date`,
  `status`, **Teilerfüllungs-Tracking** `per_delivered`/`delivery_status` und
  `per_billed`/`billing_status`, `is_subcontracted`.
- **`customer`** (`erpnext/selling/doctype/customer/customer.json`): **`portal_users` (Table)** +
  `customer_primary_contact` — d. h. ERPNext bindet Portal-Logins über eine Kind-Tabelle an
  **genau einen** Customer (Muster für T-01).
- **Hinweis (Unsicherheit):** Das generische `Contact`-DocType (mit `user`-Feld + Dynamic-Link auf
  den Kunden) liegt in **frappe-core**, nicht im erpnext-Sparse-Klon — daher hier **nicht**
  dateibelegt; oben zitiert ist nur das, was real in `customer.json` steht.

### 2.5 Fertigung (Routing)
ERPNext hat vollwertige `bom`/`work_order`/`job_card` (Operationen, Workstations). Diese liegen im
`manufacturing`-Modul; für den Abgleich relevant nur als **Referenz für Routing/Kapazität**
(siehe „bewusst weggelassen").

---

## Schritt 3 — Lastenheft-Anforderungsraster (Spalte B)

Differenzierende Anforderungen (Kap. 31, T-Matrix; MoSCoW Kap. 25):

| Code | Anforderung | Priorität |
|---|---|---|
| T-01 | WooCommerce-Bestellung → **Firmenkunde** (nicht Mitarbeiterkonto) | Kritisch |
| T-02 | Varianten-Mapping (Polo Blau XL → Variante Blau XL) | Kritisch |
| T-03 | Kundenspezifische Stückliste (Kunde→Vorlage) | Kritisch |
| T-04 | **Mehrstufige Fremdvergabe** PA→Siebdruck→Stick, **Rücklauf buchbar** | Kritisch |
| T-05 | Multi-Lieferant: Start erst nach beiden Wareneingängen | Kritisch |
| T-08 | Preisgruppe je Shop (Premium → Premium-Preise) | Hoch |
| T-10 | Nachkalkulation DB-Soll vs. DB-Ist | Hoch |
| — | Stickerei-Partnerlogik (Angebots- vs. Direktprozess), 3 Partner | Kap. 31 |
| — | Staffelpreise, Varianten Farbe×Größe | Kap. 4/31 |
| — | GoBD-Grenze: operative Buchhaltung + DATEV, **keine** Vollbuchhaltung | G1 |
| — | E-Rechnung XRechnung/ZUGFeRD | F3 |

Lastenheft zur Beistellung explizit (Z. 772/787): „Lohnveredelung mit Beistellung + Rücklauf …
**Custom (kein dediziertes Modul; über Bestellung/Materiallager/Unterproduktion)**" und T-04:
„Alle Unteraufträge mit Status/Termin; **Rücklauf buchbar**". Mehrstufig „kommt selten vor, muss
aber abbildbar sein" (Z. 150–152).

---

## Schritt 4 — Dreiachsiger Abgleich

| Domäne / Entität | Lastenheft (B) | ERPNext-Referenz (A, Pfad) | IST im Bau (C) | Bewertung |
|---|---|---|---|---|
| **Beistellung→Rücklauf (T-04)** | Rücklauf buchbar, mehrstufig abbildbar; **Beistellung = ganze eingekaufte Textilien, kein Rohmaterial** (Festlegung TEXMA) | `subcontracting_order_supplied_item`: `required/supplied/consumed/returned_qty` je RM (für Stücklisten-Verbrauch) | `SubProductionOrder.beistellMenge/ruecklaufMenge` aggregiert am Kopf (702–720); Schwund = `beistellMenge − ruecklaufMenge` ableitbar | **bewusst weglassen** (RM-Granularität = Überbau); offen nur Textil-Variant-Link + Bestandsbewegung (Could) |
| Mehrstufigkeit (PA-a/-b) | selten, muss abbildbar | Kette via PO→SCO | `SubProductionOrder.sequence` (709) | **✓ Bau deckt ab** |
| Lohn/Service-Kosten je Stufe | Nachkalkulation (T-10) | `subcontracting_order_item.service_cost_per_qty`, `subcontracting_bom.service_item` | `SubProductionOrder.lohnCents` (Kopf) (719) | **✓ Bau deckt ab** (grob) |
| T-01 Firmenkunde-Mapping | kritisch | `customer.portal_users` (Table), `customer_primary_contact` | `ShopConnector.companyId` (443) + `PortalUser.companyId` (510) isoliert | **✓ Bau deckt ab** |
| T-02 Varianten Farbe×Größe | kritisch | `item.variant_based_on=Item Attribute`, `item_variant_attribute` | `Variant`+`VariantAttribute{name,value}` (299/324) | **✓ Bau deckt ab** |
| Attribut-**Stammdaten** (kontrolliertes Vokabular, SKU-Kürzel) | implizit (Mapping-Fehler vermeiden) | `item_attribute`(+`abbr`, numeric ranges) | **fehlt** — freie Strings, keine Wertelisten | **Lücke / Muster vorhanden** (Could) |
| T-03 kundenspez. Stückliste | kritisch | (kein direktes Pendant; BOM+Pricing Rule) | `BomTemplate`/`BomTemplateItem` + Shop-Zuordnung (661–675) | **✓ Bau deckt ab** |
| Staffelpreise (T-08/Kap.4) | hoch | `pricing_rule.min_qty/max_qty`+`applicable_for` | `PriceGroupPriceTier`/`CustomerPriceTier.minMenge` (349/363), Präzedenz in `pricing.ts` | **✓ Bau deckt ab** (sauberer, dedizierte Tier-Tabelle) |
| Angebot: Verfall/Verlustgrund | Kap. 35.1 | `quotation.valid_till`, `status=Expired/Lost`, `order_lost_reason` | `Quote.gueltigBisAm`+`verlustgrund` (B8) | **✓ Bau deckt ab** |
| Auftrag: Teilerfüllungs-% | (nicht gefordert; B2B make-to-order) | `sales_order.per_delivered/per_billed` | nur Status-Enum (603) | **bewusst weglassen** |
| Stickerei-Partnerlogik (Angebot vs. Direkt) | Kap. 31 | **kein Pendant** | `StickereiService`/`StickereiStaffel` (210), Logo-Versionen | **Lücke / kein Muster → eigene Lösung** (teils gebaut) |
| Multi-Lieferant (T-05) | kritisch | PO je Supplier | `PurchaseOrder.productionId` (mehrere je PA) (981) | **✓ Bau deckt ab** |
| Fertigung Routing/Workstation/JobCard | nicht gefordert | `bom`/`work_order`/`job_card` | `ProductionOrder`+`TimeEntry`, kein Routing | **bewusst weglassen** |
| Buchhaltung Hauptbuch | **verboten** (G1) | volles GL (`accounts`) | operative BH + DATEV/E-Rechnung | **Konflikt mit ERPNext, bewusst** |
| Beistell-Bestand im Ledger | Materiallager (Z. 772) | Receipt-Items bewegen Bestand | `StockMove` ohne Beistell-/Rücklauf-Grund (1062) | **Lücke / Muster vorhanden** (Could) |

---

## Schritt 5 — Synthese

### 5.1 Echte Lücken, priorisiert (MoSCoW)

> **F1 entfällt (Festlegung TEXMA, 2026-06):** Es wird **kein Rohmaterial** an die Veredler
> beigestellt, sondern ausschließlich die **fertig eingekauften Textilien** (= bestehende `Variant`s).
> Damit ist ERPNexts Rohmaterial-Granularität (`required/consumed_qty` über Stücklisten) **Überbau** —
> der Kopf-Aggregat `beistellMenge`/`ruecklaufMenge` ist fachlich korrekt, und **Schwund/Ausschuss**
> ist als Differenz `beistellMenge − ruecklaufMenge` bereits ableitbar. Die vormals als *Should*
> geführte „RM-Vertiefung" ist damit **gestrichen** (siehe 5.2).

**Could have (klein, optional — Nutzen vor Aufwand prüfen)**
1. **Textil-Variant-Link + Bestandsbewegung der Beistellung.** `SubProductionOrder` hält heute keine
   Referenz, **welche** Textil-`Variant` (und wie viel je Variante) zum Veredler geht; die physische
   Bewegung Hauptlager → Veredler → zurück steht nicht im Ledger. Optional: `variantId`/schlanke
   Beistellzeile + `StockMove.grund` `BEISTELLUNG`/`RUECKLAUF`, damit der Bestand stimmt, solange Ware
   beim Veredler liegt. Bei 1:1-Beistellung ganzer Textilien oft verzichtbar.
2. **Attribut-Stammdaten** (`ItemAttribute`/`AttributeValue` mit Kürzel) statt freier Strings in
   `VariantAttribute` — verhindert „Blau" vs. „blau"-Mappingfehler (härtet T-02) und ermöglicht
   SKU-Kürzel. Blaupause: `item_attribute`/`item_attribute_value`.

### 5.2 Bewusst weggelassen (ERPNext-Generalität, die TEXMA nicht braucht)
- **Volles Hauptbuch/Doppik** (`accounts`): kollidiert mit **G1** — operative Buchhaltung + DATEV
  bleibt die Festlegung. Kein Gap.
- **`work_order`/`job_card`/Routing/Workstations**: TEXMA fährt „1 Auftrag = 1 PA" ohne
  Arbeitsgang-/Kapazitätsplanung; APS (frePPLe-Sidecar) ist im `domaenen-check` bereits als
  **Future** markiert. Kein Gap, solange keine finite Kapazitätsplanung gefordert ist.
- **`sales_order.per_delivered/per_billed`-Teilerfüllung in %**: B2B-Make-to-Order liefert i. d. R.
  komplett; Prozent-Tracking wäre Überbau.
- **`pricing_rule`-Vollmaschine** (mixed/cumulative/Gratisartikel/Coupons): der Bau löst Staffel mit
  einer schlanken, dedizierten Tier-Tabelle — bewusst einfacher.
- **Beistell-Rohmaterial-Granularität** (`required/consumed_qty` je RM, Stücklisten-Verbrauch):
  Überbau, da TEXMA **keine Rohmaterialien**, sondern **ganze eingekaufte Textilien** beistellt
  (1:1 raus/rein). Kopf-Aggregat + ableitbarer Schwund genügen.

### 5.3 Konflikte (Bau ↔ Lastenheft)
- **Keine inhaltlichen Konflikte** gefunden. Der einzige „Widerspruch" ist gegenüber **ERPNext**
  (Hauptbuch), und der ist **vom Lastenheft so gewollt** (G1) — also kein Bau-Fehler.
- **Sequenz-Beobachtung (kein Konflikt):** Das **Kundenportal** ist im Lastenheft als **Could**
  und „Add-on, nachdem das Kernsystem steht" eingestuft (Kap. 25, Z. 931). Im Bau wurde B13 bereits
  umgesetzt. Das widerspricht nicht der Anforderung, weicht aber von der **Prioritätenfolge** ab —
  bei Kapazitätsknappheit gegen Kern-Lücken (5.1) abwägen.

### 5.4 Offene Fragen / Annahmen
- **F1 — GEKLÄRT (TEXMA, 2026-06):** Beigestellt werden **keine Rohmaterialien**, sondern die
  **fertig eingekauften Textilien**. RM-Granularität ist damit Überbau; Kopf-Aggregat genügt.
- **F2 (offen, Could):** Soll der Textilfluss zum/vom Veredler im `StockMove`-Ledger erscheinen
  (Inventur-Genauigkeit, solange Ware draußen liegt) — inkl. Link auf die beigestellte `Variant` —
  oder bleibt Beistellung bewusst außerhalb der Bestandsführung?
- **F3:** Ist ein kontrolliertes Attribut-Vokabular (Farben/Größen-Stammdaten) gewünscht, oder ist
  die heutige Freitext-Variantenpflege ausreichend?
- **Annahme:** „Stickerei-Partnerlogik (Angebot vs. Direkt)" ist TEXMA-spezifisch; ERPNext liefert
  hierfür **keine** Blaupause — die vorhandene `Stickerei`-Logik ist der richtige eigene Weg, ihre
  Vollständigkeit gegen Kap. 31 wäre separat zu prüfen (nicht Teil dieses Datenmodell-Abgleichs).

---

**STOPP — keine Implementierung.** Dieser Bericht ist die Entscheidungsgrundlage; welche der
Lücken (5.1) gebaut werden, ist ein separater Schritt nach Sichtung.
