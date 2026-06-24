-- USt-Satz je Angebotsposition (A2). Default 19 % (Regelsatz); 7 % für ermäßigte
-- Positionen. Bestehende Zeilen erhalten den Regelsatz.
ALTER TABLE "QuoteLine" ADD COLUMN     "taxRatePct" INTEGER NOT NULL DEFAULT 19;
