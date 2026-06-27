-- Veredelungsbezug: Positionsnummer der Textilposition, auf die sich eine Veredelungs-
-- position bezieht (Kap. 5.4/11). Strukturierte Verknüpfung statt nur Freitext.
ALTER TABLE "QuoteLine" ADD COLUMN "bezugPosition" INTEGER;
ALTER TABLE "OrderLine" ADD COLUMN "bezugPosition" INTEGER;
