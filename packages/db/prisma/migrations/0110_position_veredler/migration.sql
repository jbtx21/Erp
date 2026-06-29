-- Veredler je Position (G1): Fremdvergabe direkt aus dem Vertriebsweg. Eine Veredelungs-
-- position kann einen Veredler tragen, ohne dass der (ggf. frei erfasste) Katalogartikel
-- einen Veredler hat. loadOrderForProduction nimmt line.veredlerId vor article.veredlerId.
-- Additive, nullable Spalte → Bestand bleibt grün (null = inhouse bzw. aus Artikel ableiten).
ALTER TABLE "QuoteLine" ADD COLUMN "veredlerId" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "veredlerId" TEXT;
