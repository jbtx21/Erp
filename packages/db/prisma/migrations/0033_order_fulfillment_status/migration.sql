-- ERP-Grundfunktion G-4: Teil-Erfüllungs-Status am Auftrag (Liefer-/Fakturastatus).

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NICHT', 'TEILWEISE', 'VOLL');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lieferstatus" "FulfillmentStatus" NOT NULL DEFAULT 'NICHT';
ALTER TABLE "Order" ADD COLUMN "fakturastatus" "FulfillmentStatus" NOT NULL DEFAULT 'NICHT';
