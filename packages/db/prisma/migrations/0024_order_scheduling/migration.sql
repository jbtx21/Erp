-- B9: Auftrag-Statusausbau (K-26) + Liefertermin/Rückwärtsterminierung (Kap. 35.2)

-- AlterEnum: neue Status FAKTURIERT, ABGESCHLOSSEN
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAKTURIERT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ABGESCHLOSSEN';

-- AlterTable: zugesagter Liefertermin
ALTER TABLE "Order" ADD COLUMN "zugesagterLiefertermin" TIMESTAMP(3);
