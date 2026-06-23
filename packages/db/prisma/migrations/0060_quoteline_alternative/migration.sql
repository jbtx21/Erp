-- Angebotsposition als Alternative (Kunde wählt) — nicht in den Auftrag übernehmen.
ALTER TABLE "QuoteLine" ADD COLUMN "isAlternative" BOOLEAN NOT NULL DEFAULT false;
