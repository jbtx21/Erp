-- Multi-Lager Stufe 1: echtes Warehouse-Modell neben dem bisherigen StockLager-Enum
-- (Strangler). Die 4 bestehenden Läger werden als Warehouse-Seeds angelegt; die
-- warehouseId-Spalten werden aus dem Enum (bzw. HAUPT für StockLevel) backfilled.

-- CreateEnum
CREATE TYPE "WarehouseKind" AS ENUM ('HAUPT', 'MUSTER', 'SHOWROOM', 'TRANSFERDRUCK', 'SONSTIGE');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WarehouseKind" NOT NULL DEFAULT 'SONSTIGE',
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");
CREATE INDEX "Warehouse_kind_idx" ON "Warehouse"("kind");
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: warehouseId-FKs (additiv, nullable)
ALTER TABLE "StockLevel" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockMove" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockReservation" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockThreshold" ADD COLUMN "warehouseId" TEXT;

ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockThreshold" ADD CONSTRAINT "StockThreshold_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockMove_variantId_warehouseId_idx" ON "StockMove"("variantId", "warehouseId");

-- Seed der 4 bestehenden Läger als Warehouses (feste IDs für den Backfill)
INSERT INTO "Warehouse" ("id", "code", "name", "kind", "active") VALUES
  ('wh_haupt', 'HAUPT', 'Hauptlager', 'HAUPT', true),
  ('wh_muster', 'MUSTER', 'Musterlager', 'MUSTER', true),
  ('wh_showroom', 'SHOWROOM', 'Showroom', 'SHOWROOM', true),
  ('wh_transferdruck', 'TRANSFERDRUCK', 'Transferdrucke', 'TRANSFERDRUCK', true);

-- Backfill der warehouseId aus dem bisherigen Enum (StockLevel = HAUPT-Cache)
UPDATE "StockMove" SET "warehouseId" = 'wh_' || lower("lager"::text);
UPDATE "StockReservation" SET "warehouseId" = 'wh_' || lower("lager"::text);
UPDATE "StockThreshold" SET "warehouseId" = 'wh_' || lower("lager"::text);
UPDATE "StockLevel" SET "warehouseId" = 'wh_haupt';
