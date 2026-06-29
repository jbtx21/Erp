-- Positionsmaske (Anfrage/Angebot/Auftrag, Xentral-Vorbild): Strukturzeilen + Positions-Flags.
-- Additiv (Strangler): Bestandszeilen bleiben gültig (Defaults = bisheriges Verhalten).
--   lineType        ARTIKEL | GRUPPE | ZWISCHENSUMME | GRUPPENSUMME (Strukturzeilen)
--   placement       Veredelungs-Platzierung ("Brust links" …) → speist das Werkstattblatt
--   altPreisText    Alternativtext statt Euro-Betrag im PDF ("nach Aufwand")
--   imPdfAusblenden Position im Beleg-PDF ausblenden
--   OrderLine.isAlternative  Alternativen am Auftrag eingefroren (GoBD), zählen nicht in die Summe

ALTER TABLE "QuoteLine" ADD COLUMN "lineType" TEXT NOT NULL DEFAULT 'ARTIKEL';
ALTER TABLE "QuoteLine" ADD COLUMN "placement" TEXT;
ALTER TABLE "QuoteLine" ADD COLUMN "altPreisText" TEXT;
ALTER TABLE "QuoteLine" ADD COLUMN "imPdfAusblenden" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderLine" ADD COLUMN "isAlternative" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderLine" ADD COLUMN "lineType" TEXT NOT NULL DEFAULT 'ARTIKEL';
ALTER TABLE "OrderLine" ADD COLUMN "placement" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "altPreisText" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "imPdfAusblenden" BOOLEAN NOT NULL DEFAULT false;
