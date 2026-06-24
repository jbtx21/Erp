-- Vormerkung/Reservierung gegen laufende Aufträge + Meldebestand je Variante × Lager.
CREATE TYPE "StockReservationStatus" AS ENUM ('AKTIV', 'ERLEDIGT', 'STORNIERT');

CREATE TABLE "StockReservation" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "lager" "StockLager" NOT NULL DEFAULT 'HAUPT',
  "qty" INTEGER NOT NULL,
  "orderId" TEXT,
  "belegRef" TEXT,
  "note" TEXT,
  "status" "StockReservationStatus" NOT NULL DEFAULT 'AKTIV',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StockReservation_variantId_lager_status_idx" ON "StockReservation"("variantId", "lager", "status");
CREATE INDEX "StockReservation_orderId_idx" ON "StockReservation"("orderId");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StockThreshold" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "lager" "StockLager" NOT NULL DEFAULT 'TRANSFERDRUCK',
  "minQty" INTEGER NOT NULL,
  "alerting" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockThreshold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockThreshold_variantId_lager_key" ON "StockThreshold"("variantId", "lager");
ALTER TABLE "StockThreshold" ADD CONSTRAINT "StockThreshold_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
