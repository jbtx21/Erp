-- B7: Kostenstellen (Kap. 37.1) — Auswertung, keine Buchung (G1)

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_nummer_key" ON "CostCenter"("nummer");

-- AlterTable: optionale Kostenstellen-Zuordnung
ALTER TABLE "Invoice" ADD COLUMN "costCenterId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "costCenterId" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "costCenterId" TEXT;

-- AddForeignKey: SET NULL — Kostenstelle löschbar, Beleg bleibt erhalten (GoBD)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
