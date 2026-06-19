-- AlterTable
ALTER TABLE "SubProductionOrder" ADD COLUMN     "beistellMenge" INTEGER,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "lohnCents" INTEGER,
ADD COLUMN     "ruecklaufMenge" INTEGER;

