-- Artikel-Pflichtstammdaten (überall, für Textil/Veredelung/Sonstiges): verbindliche
-- Basis-Preise ekCents/vkCents je Artikel + Beschreibung als Pflichtfeld.
-- „Standard + Übersteuerung": Preisgruppen-/Lieferanten-/Staffel-Preise auf Variantenebene
-- bleiben als Übersteuerung erhalten; fehlt eine, fällt der Preis-Resolver auf diese Basis zurück.
-- Additiv mit Backfill (ADD nullable → UPDATE → SET NOT NULL) — Bestand bleibt grün.

ALTER TABLE "Article" ADD COLUMN "ekCents" INTEGER;
ALTER TABLE "Article" ADD COLUMN "vkCents" INTEGER;

-- Backfill VK: günstigster Preisgruppen-Einzelpreis über die Varianten des Artikels, sonst 0.
UPDATE "Article" a SET "vkCents" = COALESCE((
  SELECT MIN(p."netCents") FROM "PriceGroupPrice" p
  JOIN "Variant" v ON v."id" = p."variantId"
  WHERE v."articleId" = a."id"
), 0);

-- Backfill EK: günstigster Lieferanten-EK über die Varianten des Artikels, sonst 0.
UPDATE "Article" a SET "ekCents" = COALESCE((
  SELECT MIN(s."ekCents") FROM "SupplierItem" s
  JOIN "Variant" v ON v."id" = s."variantId"
  WHERE v."articleId" = a."id"
), 0);

-- Beschreibung Pflicht: fehlende mit dem Artikelnamen vorbelegen.
UPDATE "Article" SET "description" = "name" WHERE "description" IS NULL;

ALTER TABLE "Article" ALTER COLUMN "ekCents" SET NOT NULL;
ALTER TABLE "Article" ALTER COLUMN "vkCents" SET NOT NULL;
ALTER TABLE "Article" ALTER COLUMN "description" SET NOT NULL;
