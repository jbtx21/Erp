-- Legacy-Spalte Article.isVeredelung entfernen. Der Artikeltyp-Diskriminator
-- Article.type (FINISHING) ist seit 0083 die einzige Quelle für „Veredelung".
-- Sicherheitsnetz: vor dem Drop letzte Backfill-Synchronisation type ← isVeredelung,
-- falls irgendwo isVeredelung=true gesetzt wurde ohne type zu pflegen.
UPDATE "Article" SET "type" = 'FINISHING' WHERE "isVeredelung" = true AND "type" = 'STOCK';
ALTER TABLE "Article" DROP COLUMN "isVeredelung";
