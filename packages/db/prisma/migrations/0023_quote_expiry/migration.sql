-- B8: Angebotsverfall + Verlustgrund (Kap. 35.1)
ALTER TABLE "Quote" ADD COLUMN "gueltigBisAm" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "verlustgrund" TEXT;
