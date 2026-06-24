# Stammdaten-Feldanalyse: OpenXE/Xentral vs. TEXMA — mit EAN-Listen-Bezug

*Stand: 2026-06-24. Quellen: OpenXE `database/struktur.sql` (quellenverifiziert), Xentral-Domänenwissen, TEXMA-`schema.prisma`, sowie unser EAN-Import (`packages/shared/src/ean-import.ts`).*

## Was unsere EAN-Listen liefern (und damit ins ERP fließen kann)

Der EAN-Import (`EAN_IMPORT_COLUMNS`) liest je Variante:

| EAN-Spalte | Feld | Ziel in TEXMA |
|---|---|---|
| EAN | gtin | `Variant.gtin` ✅ |
| Artikelnummer | sku | `Article.sku` / `Variant.sku` ✅ |
| Bezeichnung | name | `Article.name` ✅ |
| Marke | brand | `Article.brand` ✅ |
| Material | materialComposition | `Article.materialComposition` ✅ |
| Pflegehinweis | careInstructions | `Article.careInstructions` ✅ |
| Zolltarifnummer | hsCode | `Article.hsCode` ✅ |
| Ursprungsland | originCountry | `Article.originCountry` ✅ |
| Gewicht (g) | weightGrams | `Variant.weightGrams` ✅ |
| EK (EUR) | ekCents | `SupplierItem` (EK je Lieferant) ✅ |

**Fazit:** Jede Spalte unserer EAN-Listen hat bereits ein Zielfeld — der PIM-Kern ist vollständig befüllbar. Lücken bestehen nur bei Feldern, die in **Lieferanten-APIs** (ID Identity, Stanley/Stella) zusätzlich vorhanden sind, aber bei uns noch kein Zielfeld haben (siehe Empfehlungen).

---

## 1. Artikelstammdaten

**TEXMA `Article`:** sku, name, description, isVeredelung, veredlerId, materialComposition, careInstructions, brand, hsCode, originCountry, collectionId. **`Variant`:** sku, attributes (Farbe/Größe), gtin, weightGrams, prices (Preisgruppen + Staffeln), supplierItems (EK je Lieferant), isBundle, Lager/Reservierung/Meldebestand.

**OpenXE `artikel`** (~230 Spalten, Auszug, quellenverifiziert): nummer, name_de/en, beschreibung, warengruppe, hersteller, ean, herstellernummer, zolltarifnummer, herkunftsland, gewicht/nettogewicht, laenge/breite/hoehe, einheit, steuersatz, lagerartikel, mindestlager, mindestbestellung, seriennummern, variante/variante_von, matrixprodukt, stueckliste, lieferzeit, shopartikel + SEO, freifeld1…40. Aus Xentral/Domäne zusätzlich textilrelevant aus Lieferantenfeeds: **gm2 (Flächengewicht), Gender, StyleFit, Category/Warengruppe**.

| Feld | OpenXE/Xentral | TEXMA | Textil-Relevanz | Aus EAN/Feed? |
|---|---|---|---|---|
| SKU/Nummer | ✅ | ✅ | hoch | EAN ✅ |
| Name/Beschreibung | ✅ | ✅ | hoch | EAN ✅ |
| EAN/GTIN | ✅ | ✅ Variant.gtin | hoch | EAN ✅ |
| Marke | ✅ hersteller | ✅ brand | hoch | EAN ✅ |
| Material/Pflege | ✅ | ✅ | hoch (EU-Pflicht) | EAN ✅ |
| Zolltarif/Ursprung | ✅ | ✅ | hoch (Export) | EAN ✅ |
| Gewicht | ✅ | ✅ Variant | mittel | EAN ✅ |
| Varianten Farbe×Größe | ✅ matrixprodukt | ✅ attributes | hoch | Feed ✅ |
| EK/VK/Staffel | ✅ | ✅ prices/tiers | hoch | EAN(EK)/Feed |
| **Warengruppe/Category** | ✅ warengruppe | ⚠️ nur collection | hoch | Feed ✅ (ID Category) |
| **Gender** (H/D/K) | ✅ | ❌ | hoch | Feed ✅ (ID/SS) |
| **Flächengewicht gm²** | ✅ gm2 | ❌ | mittel-hoch | Feed ✅ (ID gm2) |
| **Passform/StyleFit** | ✅ | ❌ | mittel | Feed ✅ (SS/ID StyleFit) |
| **Mindestbestellmenge** | ✅ mindestbestellung | ❌ | mittel | Feed (SS ab_menge) |
| Maße L/B/H | ✅ | ❌ | niedrig | – |
| Freifelder | ✅ 1…40 | ❌ | niedrig | – |

**Empfohlene Artikel-Ergänzungen (S/M/L):** `gender` (S), `category`/Warengruppe (S), `gm2` Flächengewicht (S), `styleFit` Passform (S), `minOrderQty` Mindestbestellmenge (S). Alle aus den Lieferanten-Feeds (ID/Stanley-Stella) befüllbar und textilrelevant. Maße/Freifelder bewusst niedrig.

---

## 2. Kundenstammdaten

**TEXMA `Company`:** name, branche, Adresse (street/zip/city/country), vatId, taxNumber, zahlungszielTage, skontoPercent/Days, paymentMethod, lieferbedingung, kreditlimitCents, mahnsperre, priceGroupId, DSGVO-Sperre/Anonymisierung, contacts, deliveryAddresses (abweichende Lieferadressen).

**OpenXE `adresse` (Kunde):** kundennummer, debitorenkonto, name/vorname/nachname, anschreiben/titel, strasse/plz/ort/land, abweichende Rechnungsadresse (eigene Spalten), telefon/mobil/email, dokumentspezifische E-Mails (rechnungs_email, auftrag_email…), ustid/steuernummer, zahlungsweise/zahlungsziel/skonto, kreditlimit, **liefersperre** (+grund/datum), rabatt/rabatt1…5, **Bank/IBAN/SEPA-Mandat** (mandatsreferenz, glaeubigeridentnr), sprache, waehrung, freifeld1…20.

| Feld | OpenXE | TEXMA | Relevanz | Kommentar |
|---|---|---|---|---|
| Kundennummer | ✅ | ⚠️ (id) | hoch | eigene fortlaufende Kundennr. fehlt |
| Adresse + Liefer | ✅ | ✅ | hoch | DeliveryAddress vorhanden |
| USt-IdNr/Steuernr | ✅ | ✅ | hoch | – |
| Zahlung/Skonto | ✅ | ✅ | hoch | – |
| Kreditlimit | ✅ | ✅ | hoch | – |
| Mahnsperre | ⚠️ (Mahnwesen) | ✅ | hoch | TEXMA voraus |
| **Liefersperre** | ✅ | ❌ | hoch | Sperre vor Auslieferung fehlt |
| **SEPA-Mandat** (Ref/Datum, Gläubiger-ID) | ✅ | ❌ | hoch | für Lastschrift nötig |
| **Bankverbindung Kunde** (IBAN/BIC) | ✅ | ❌ | mittel | für Lastschrift/Erstattung |
| **Dok.-spezifische E-Mails** (Rechnung/Auftrag) | ✅ | ❌ | mittel | Beleg-Versand-Routing |
| Preisgruppe | ⚠️ | ✅ priceGroupId | hoch | TEXMA sauberer |
| Sprache/Währung | ✅ | ❌ | mittel | meist DE/EUR |
| Rabatt-Staffel | ✅ rabatt1…5 | ⚠️ priceGroup | mittel | via Preisgruppe abgedeckt |

**Empfohlene Kunden-Ergänzungen:** fortlaufende `kundennummer` (S), `liefersperre` (+Grund) (S), SEPA-Mandat `mandatsreferenz`/`mandatsDatum`/`glaeubigerId` + Kunden-`iban`/`bic` (M, nur falls Lastschrift), dok.-spezifische `rechnungsEmail` (S).

---

## 3. Lieferantenstammdaten

**TEXMA `Supplier`:** name, vatId, iban, bic, Adresse, zahlungszielTage, skontoPercent/Days, lieferzeitTage, notiz, contacts, kind (Connector-Art), baseUrl/consumerKey/consumerSecretEnc/syncCursor (API-Anbindung), supplierItems (Katalog/EK), active.

**OpenXE (Lieferant in `adresse`):** lieferantennummer, kreditorenkonto, **kundennummerlieferant** (unsere Kundennr. beim Lieferanten), zahlungsweise/-ziel/skonto (Lieferant), versandart, **lieferbedingung**, hinweistext, Bank/IBAN/SWIFT; EK-Katalog in `einkaufspreise` (bestellnummer, lieferzeit, ab_menge/Mindestmenge, Rahmenvertrag).

| Feld | OpenXE | TEXMA | Relevanz | Kommentar |
|---|---|---|---|---|
| Name/Adresse | ✅ | ✅ | hoch | – |
| USt-IdNr | ✅ | ✅ | hoch | – |
| Bank IBAN/BIC | ✅ | ✅ | hoch | – |
| Zahlung/Skonto | ✅ | ✅ | hoch | – |
| Lieferzeit | ✅ (je Artikel) | ✅ lieferzeitTage | mittel | TEXMA pauschal, OpenXE je Artikel |
| EK-Katalog je Variante | ✅ einkaufspreise | ✅ SupplierItem | hoch | + Bestellnr. empf. |
| API-Anbindung | ⚠️ | ✅ kind/Cursor | hoch | TEXMA voraus (Connector) |
| **Kreditorennummer** | ✅ | ❌ | mittel | Fibu/DATEV |
| **Unsere Kundennr. beim Lieferanten** | ✅ kundennummerlieferant | ❌ | mittel | für Bestellungen/Portale |
| **Lieferanten-Bestellnummer je Artikel** | ✅ bestellnummer | ⚠️ | hoch | präzise Bestellung |
| **Mindestbestellwert** | ✅ | ❌ | mittel | Bestellvorschlag |

**Empfohlene Lieferanten-Ergänzungen:** `bestellnummer`/`supplierSku` je `SupplierItem` (S, kommt aus ID `ItemId` / SS `B2BSKUREF` — teils schon vorhanden), `kundennummerLieferant` (S), `kreditorNr` (S, Fibu), `mindestbestellwertCents` (S).

---

## Gesamt-Empfehlung (priorisiert, S/M/L)

1. **Artikel: `gender`, `category`, `gm2`, `styleFit`, `minOrderQty`** (je S) — direkt aus den Lieferanten-Feeds (ID/Stanley-Stella) befüllbar, hoher Textil-Nutzen, kleiner Aufwand. **Top-Empfehlung.**
2. **Lieferant: `supplierSku`/`bestellnummer` je SupplierItem** (S) — fällt beim Katalog-Import ohnehin an (ID `ItemId`, SS `B2BSKUREF`).
3. **Kunde: fortlaufende `kundennummer` + `liefersperre`** (je S) — Standardanforderungen, klein.
4. **Kunde: SEPA-Mandat + Bankverbindung** (M) — nur falls Lastschrift-Einzug geplant.
5. **Lieferant: `kreditorNr` + Kunde `debitorNr`** (S) — Voraussetzung für den späteren DATEV-Export.

Maße, Freifelder, Mehrsprachigkeit, MLM/Verein/POS aus OpenXE sind für TEXMA **nicht** empfohlen (kein Nutzen fürs Geschäft).
