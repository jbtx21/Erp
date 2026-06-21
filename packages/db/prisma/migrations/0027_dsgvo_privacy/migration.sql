-- B12: DSGVO Sperren/Anonymisieren statt Löschen (Kap. 28) — Belege bleiben (WORM)
ALTER TABLE "Company" ADD COLUMN "gesperrtAm" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "anonymisiertAm" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "gesperrtAm" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "anonymisiertAm" TIMESTAMP(3);
