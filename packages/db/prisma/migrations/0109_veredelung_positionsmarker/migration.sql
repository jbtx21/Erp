-- Explizite Platzierungs-Skizze aus dem SVG-Positions-Picker (T-04): Kleidungstyp
-- (shirt|cap|hose), Ansicht (front|back|links|rechts|hinten) und Markerpunkt-Id (z. B. "bl").
-- Haben Vorrang vor der Heuristik in resolveGarmentPlacement (Werkstattblatt). Additive,
-- nullable Spalten — Bestand bleibt grün (null = aus Platzierungstext ableiten).
ALTER TABLE "QuoteLine" ADD COLUMN "positionType" TEXT;
ALTER TABLE "QuoteLine" ADD COLUMN "positionSide" TEXT;
ALTER TABLE "QuoteLine" ADD COLUMN "positionId" TEXT;

ALTER TABLE "OrderLine" ADD COLUMN "positionType" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "positionSide" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "positionId" TEXT;
