# HAKRO-Pricat → TEXMA EAN-Import

`hakro-to-ean-csv.mjs` wandelt eine HAKRO-Pricat (`.xlsx`, Format `PRICAT_ITEM`,
68 Spalten) in eine CSV im Format der **EAN-Listen-Import**-Seite des ERP um:

```
EAN;Artikelnummer;Bezeichnung;Marke;Material;Pflegehinweis;Zolltarifnummer;Ursprungsland;Gewicht (g);EK (EUR)
```

## Nutzung
```bash
node scripts/pricat/hakro-to-ean-csv.mjs <pricat.xlsx> [out.csv]
```
Reines Node (kein npm-Paket) — die `.xlsx` ist ein ZIP, SharedStrings + Sheet-XML
werden direkt geparst. `unzip` muss verfügbar sein.

## Spalten-Mapping (HAKRO → EAN-Import)
| HAKRO | → | EAN-Import |
|---|---|---|
| GTIN | → | EAN |
| ItemCode | → | Artikelnummer (Varianten-SKU) |
| Description (+ Description2 = Farbe, Größe) | → | Bezeichnung |
| *(konstant)* | → | Marke = „HAKRO" |
| Mixture | → | Material |
| WashingTemperature | → | Pflegehinweis |
| HarmonizedCode | → | Zolltarifnummer |
| CountryOfOrigin | → | Ursprungsland |
| ItemWeight (kg) ×1000 | → | Gewicht (g) |
| **min(NetPrice, _H1, _H2, _H3)** | → | EK (EUR) — **Bestpreis** |

**EK = Bestpreis:** TEXMA hat bei HAKRO immer den besten Konditionspreis, daher wird
der **niedrigste** Staffelpreis der Pricat (NetPrice_H3, Menge 500) als EK genommen,
nicht der Basispreis (Menge 1).

## VK-Generierung beim Import (Preisgruppen)
Der EAN-Import erzeugt den VK je Preisgruppe aus dem EK über einen Aufschlagsfaktor.
HAKRO-Aufschläge (Default in der Import-Maske, editierbar):

| Preisgruppe | Aufschlag | Beispiel (EK 25,21 €) |
|---|---|---|
| STANDARD (Normalkunde) | 1,80 | 45,38 € |
| TOP | 1,75 | 44,12 € |
| PREMIUM | 1,70 | 42,86 € |
| WIEDERVERKAEUFER | 1,35 | 34,03 € |

## Import ins ERP
1. Pricat konvertieren (s. o.) → CSV.
2. ERP → **Stammdaten → EAN-Listen-Import** → CSV einfügen/laden → **Vorschau/Abgleich**.
3. HAKRO-Artikel sind neu → alle als **Nicht-Treffer**; Schalter **„Nicht-Treffer anlegen"**
   aktivieren. Optional **EK + Lieferant (HAKRO)** schreiben und **VK je Preisgruppe**
   über Aufschlag generieren.
4. Erneuter Lauf späterer Pricat-Versionen matcht dann **per EAN** und aktualisiert nur.

Hinweis: Die Roh-Pricat (`PRICAT_ITEM_EU_*.xlsx`) wird **nicht** versioniert (enthält die
volle Preisliste); nur dieses Skript liegt im Repo.
