-- Sammelbestellung (Kap. 18.2): Bestellmodus je Shop + gebündelte Sammelbestellungen.

-- 1) Bestellmodus je Shop (SOFORT = direkt, SAMMEL = periodisch gebündelt).
ALTER TABLE "ShopConnector" ADD COLUMN "bestellmodus" TEXT NOT NULL DEFAULT 'SOFORT';
ALTER TABLE "ShopConnector" ADD COLUMN "sammelInterval" TEXT;

-- 2) Sammelbestellung-Vorgang je Shop und Periode.
CREATE TABLE "CollectiveOrder" (
  "id"              TEXT NOT NULL,
  "number"          TEXT NOT NULL,
  "shopConnectorId" TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "interval"        TEXT NOT NULL,
  "periodStart"     TIMESTAMP(3) NOT NULL,
  "periodEnd"       TIMESTAMP(3) NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'OFFEN',
  "closedAt"        TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectiveOrder_number_key" ON "CollectiveOrder"("number");
CREATE UNIQUE INDEX "CollectiveOrder_shopConnectorId_periodStart_key" ON "CollectiveOrder"("shopConnectorId", "periodStart");
CREATE INDEX "CollectiveOrder_companyId_idx" ON "CollectiveOrder"("companyId");
CREATE INDEX "CollectiveOrder_status_idx" ON "CollectiveOrder"("status");
ALTER TABLE "CollectiveOrder" ADD CONSTRAINT "CollectiveOrder_shopConnectorId_fkey" FOREIGN KEY ("shopConnectorId") REFERENCES "ShopConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectiveOrder" ADD CONSTRAINT "CollectiveOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Auftrag → Sammelbestellung (null = Einzel-/Sofortauftrag).
ALTER TABLE "Order" ADD COLUMN "collectiveOrderId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_collectiveOrderId_fkey" FOREIGN KEY ("collectiveOrderId") REFERENCES "CollectiveOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
