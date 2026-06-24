-- Angebots-Kopf-Felder (A3): Zahlungsziel, Incoterm, Versandregel.
-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "incoterm" TEXT,
ADD COLUMN     "versandregel" TEXT,
ADD COLUMN     "zahlungszielTage" INTEGER;
