-- Angebots-Kopffelder (Xentral-Parität): Projekt/Kostenstelle, interne Bezeichnung,
-- Kunden-Bestellnummer/Kommission, gewünschter Liefertermin. Additiv, NULL-bar.
ALTER TABLE "Quote"
  ADD COLUMN "projekt" TEXT,
  ADD COLUMN "interneBezeichnung" TEXT,
  ADD COLUMN "kommission" TEXT,
  ADD COLUMN "wunschLiefertermin" TIMESTAMP(3);
