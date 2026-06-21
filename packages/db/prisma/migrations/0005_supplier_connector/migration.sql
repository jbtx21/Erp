-- CreateEnum
CREATE TYPE "SupplierKind" AS ENUM ('ID_IDENTITY', 'STANLEY_STELLA', 'HAKRO', 'FHB_NEXMART', 'MANUAL');

-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "connectorKind",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "baseUrl" TEXT,
ADD COLUMN     "consumerKey" TEXT,
ADD COLUMN     "consumerSecretEnc" TEXT,
ADD COLUMN     "kind" "SupplierKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "syncCursor" TEXT;

-- AlterTable
ALTER TABLE "SupplierItem" ADD COLUMN     "availableQty" INTEGER,
ADD COLUMN     "supplierSku" TEXT;

