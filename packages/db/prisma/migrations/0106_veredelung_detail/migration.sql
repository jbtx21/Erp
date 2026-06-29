-- Veredelungs-Detailfelder je Position (Werkstattblatt-Karte): Motiv/Logo, Motivgröße,
-- Farbton, ausführliche Platzierungsbeschreibung, Sonstiges. Additiv, NULL-bar.
ALTER TABLE "QuoteLine"
  ADD COLUMN "motiv" TEXT,
  ADD COLUMN "motivGroesse" TEXT,
  ADD COLUMN "farbton" TEXT,
  ADD COLUMN "platzierungsdetails" TEXT,
  ADD COLUMN "sonstiges" TEXT;
ALTER TABLE "OrderLine"
  ADD COLUMN "motiv" TEXT,
  ADD COLUMN "motivGroesse" TEXT,
  ADD COLUMN "farbton" TEXT,
  ADD COLUMN "platzierungsdetails" TEXT,
  ADD COLUMN "sonstiges" TEXT;
