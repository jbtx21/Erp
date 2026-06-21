-- F4: Bestand als Bewegungs-Ledger (Kap. 37.1, Vorbild Odoo stock.move)

-- CreateEnum
CREATE TYPE "StockMoveReason" AS ENUM ('EROEFFNUNG', 'WARENEINGANG', 'VERBRAUCH', 'INVENTUR', 'KORREKTUR', 'MUSTER');

-- CreateEnum
CREATE TYPE "StockLager" AS ENUM ('HAUPT', 'MUSTER');

-- CreateTable
CREATE TABLE "StockMove" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "deltaQty" INTEGER NOT NULL,
    "grund" "StockMoveReason" NOT NULL,
    "lager" "StockLager" NOT NULL DEFAULT 'HAUPT',
    "belegRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMove_variantId_lager_idx" ON "StockMove"("variantId", "lager");

-- CreateIndex
CREATE INDEX "StockMove_createdAt_idx" ON "StockMove"("createdAt");

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: Eröffnungsbuchung je vorhandenem (HAUPT-)Bestand <> 0
INSERT INTO "StockMove" ("id", "variantId", "deltaQty", "grund", "lager", "createdAt")
SELECT gen_random_uuid()::text, "variantId", "qty", 'EROEFFNUNG', 'HAUPT', CURRENT_TIMESTAMP
FROM "StockLevel"
WHERE "qty" <> 0;
