-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "productionId" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseOrder_productionId_idx" ON "PurchaseOrder"("productionId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

