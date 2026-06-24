# Bewertung: Lager- & Artikelverwaltung vs. Xentral/ERPNext

*Stand: 2026-06-24. Ehrliche Bestandsaufnahme der vorhandenen Strukturen (`schema.prisma`, `pages.tsx`, tRPC) gegen die Referenz Xentral-Artikel + ERPNext-Item.*

## 1. Was wir HEUTE haben

### Artikel (`Article`/`Variant`)
- `Article`: sku, name, description, brand, materialComposition, careInstructions, hsCode, originCountry, isVeredelung, veredlerId, collectionId — **neu (0074):** itemGroup, stockUom, isSalesItem, isPurchaseItem, minOrderQty, maxDiscountPct, leadTimeDays, gender, gm2, styleFit.
- `Variant`: sku, attributes (Farbe/Größe), gtin, weightGrams, prices (Preisgruppen + Staffeln), supplierItems (EK je Lieferant), Lager/Reservierung/Meldebestand, isBundle, mediaAssets (Bilder).
- **Artikel-UI:** Artikelliste mit Inline-Schnellbearbeitung + Massenbearbeitung + neues tabbed Detailformular (Details/Einkauf/Vertrieb/Lagerbestand/Varianten).

### Lager (`Stock*`)
- `StockMove` (Bewegungs-Ledger, F4): Bestand = Summe der Buchungen.
- `StockLevel`: **materialisierter Cache nur des HAUPT-Lagers**.
- `StockReservation` (Vormerkungen gegen Aufträge), `StockThreshold` (Meldebestände).
- `StockLager`-**Enum mit 4 festen Werten**: HAUPT, MUSTER, SHOWROOM, TRANSFERDRUCK.
- **Lager-UI:** manuelle Zu-/Abgänge + Inventur (Differenzbuchung).

## 2. Abgleich mit Xentral/ERPNext — die Lücken

| Bereich | Xentral/ERPNext | TEXMA heute | Lücke |
|---|---|---|---|
| **Multi-Lager** | Beliebige Warehouses (DocType „Warehouse"), Lagerplätze/Bins, Kommissionierung/Pickliste | **Fixes Enum (4 Lager)**, kein Warehouse-Modell, keine Bins, kein Picking | **groß** |
| **Bestand je Lager** | Bin-genau je Warehouse | nur HAUPT-Cache; übrige Lager nur über Move-Summe | **mittel-groß** |
| **Freifelder** (Custom Fields) | beliebige Freitext/Dropdown/Checkbox; als Shop-Metafelder gepusht; auf Belegen anzeigbar | ❌ keine | **mittel** |
| **Mehrsprach-Texte** (Reiter „Texte") | Beschreibungen je Sprache/Shop, auf Belege | ❌ nur 1 description | **mittel** |
| **Dateien** (Reiter „Dateien") | Bilder + PDFs/Zertifikate, Download/Mail | ⚠️ nur Bilder (MediaAsset) | **mittel** |
| **Online-Shop-Optionen** | je Artikel: in welchem Shop sichtbar; zentraler Bestand über Kanäle | ❌ keine per-Artikel-Shopzuordnung | **mittel** |
| **Artikelkalkulation** | EK + Logistik/Zoll/Flur → kalkulierter EK | ❌ nur roher EK je Lieferant | **mittel** |
| **Charge/MHD/Serien** | has_batch_no, MHD, Seriennummern | ❌ keine | **niedrig-mittel** |
| **Artikelübersicht** | Spalten frei wählbar, Tags, Filter, Massenbearbeitung | ⚠️ Massenbearbeitung ja; keine frei wählbaren Spalten/Tags/Filter | **niedrig-mittel** |
| Varianten Farbe×Größe | ✅ | ✅ | — |
| EK je Lieferant + supplierSku | ✅ | ✅ (jetzt mit supplierSku) | — |
| Meldebestand/Reservierung/Inventur | ✅ | ✅ (Ledger) | — |

## 3. Priorisierter Ausbauplan (Textilhändler **und** -veredler)

1. **Echtes Multi-Lager** ⭐ *(L)* — `Warehouse`-Modell (beliebige Läger, optional Lagerplätze) + bestandsführend je Warehouse statt 4-Werte-Enum; `StockMove`/`StockLevel`/`Reservation` auf `warehouseId` umstellen, Bestände je Lager. **Größter Nutzen für den Handel**, aber auch größter Umbau (Migration + Ledger-Anpassung). Bestehende 4 Lager als Seed-Warehouses migrieren.
2. **Artikel-Freifelder** *(M)* — generische `ArticleCustomField`-Definitionen (Typ Text/Select/Checkbox) + Werte je Artikel; optional auf Belegen/Shop-Metafeld. Hoher Pflegenutzen, mittlerer Aufwand.
3. **Mehrsprach-Texte + Dateien** *(M)* — `ArticleText` (sprache/shop → name/kurztext/beschreibung) und `ArticleFile` (PDF/Zertifikat) je Artikel; Reiter „Texte"/„Dateien" im Stammblatt.
4. **Online-Shop-Optionen je Artikel** *(M)* — `ArticleShopChannel` (Artikel × ShopConnector: sichtbar ja/nein) — zentraler Bestand, mehrere Kanäle. Verzahnt mit der Shop-Rückmeldung.
5. **Artikelkalkulation** *(M)* — kalkulierter EK = EK + Zuschläge (Logistik/Zoll/Flur), als Basis für VK-Aufschlag.
6. **Charge/MHD/Serien** *(M, optional)* — nur falls für bestimmte Handelsware nötig.
7. **Artikelübersicht-Komfort** *(S–M)* — frei wählbare Spalten + Tags + Filter (ERPNext-Listenkomfort).

## 4. Empfehlung
**Schritt 1 (Multi-Lager)** ist der mit Abstand größte Hebel für das Handelsgeschäft und behebt die „rudimentär"-Kernschwäche — gleichzeitig der größte Umbau. Sinnvolle Reihenfolge: **Multi-Lager → Freifelder → Texte/Dateien → Shop-Optionen → Kalkulation**. Schritte 2–4 sind kleiner und liefern schnell sichtbaren Stammdaten-Mehrwert; Multi-Lager braucht eine saubere Migration der 4 bestehenden Läger.
