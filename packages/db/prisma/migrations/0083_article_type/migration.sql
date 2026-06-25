-- Artikeltyp-Diskriminator (Strangler, additiv zum bestehenden isVeredelung-Flag).
CREATE TYPE "ArticleType" AS ENUM ('STOCK', 'FINISHING', 'SERVICE', 'BOM');
ALTER TABLE "Article" ADD COLUMN "type" "ArticleType" NOT NULL DEFAULT 'STOCK';
-- Backfill: bestehende Veredelungs-/Logo-Artikel auf FINISHING heben.
UPDATE "Article" SET "type" = 'FINISHING' WHERE "isVeredelung" = true;
