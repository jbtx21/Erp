-- Angebotsposition: Hauptartikel (articleId) ODER konkrete Variante (variantId).
ALTER TABLE "QuoteLine"
  ADD COLUMN "articleId" TEXT,
  ADD COLUMN "variantId" TEXT;
