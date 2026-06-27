-- Qualitätssicherung als Gate vor dem Versand (Kap. 20/QS): Stückzahl + externe
-- Veredelung kontrollieren, Foto. Erst bei BESTANDEN ist der Auftrag versandbereit.
ALTER TABLE "Order" ADD COLUMN "qsStatus" TEXT NOT NULL DEFAULT 'OFFEN';
ALTER TABLE "Order" ADD COLUMN "qsStueckzahlOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "qsVeredelungOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "qsFotoOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "qsNotiz" TEXT;
ALTER TABLE "Order" ADD COLUMN "qsGeprueftAm" TIMESTAMP(3);
