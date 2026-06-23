-- Zugewiesener Veredler je Veredelungs-/Logo-Artikel (Pflicht bei Anlage, analog Hersteller).
ALTER TABLE "Article" ADD COLUMN "veredlerId" TEXT;
CREATE INDEX "Article_veredlerId_idx" ON "Article"("veredlerId");
ALTER TABLE "Article" ADD CONSTRAINT "Article_veredlerId_fkey" FOREIGN KEY ("veredlerId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
