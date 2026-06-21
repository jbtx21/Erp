-- B5: Muster-Leihgut (Kap. 37.3) + Invoice.orderId optional (Musterrechnung ohne Auftrag)

-- AlterTable: Rechnung muss nicht mehr an einem Auftrag hängen (NULL erlaubt,
-- @unique lässt mehrere NULL zu). FK bleibt unverändert bestehen.
ALTER TABLE "Invoice" ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "SampleLoanStatus" AS ENUM ('VERLIEHEN', 'ZURUECK', 'BERECHNET');

-- CreateTable
CREATE TABLE "SampleLoan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "menge" INTEGER NOT NULL,
    "ausgegebenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SampleLoanStatus" NOT NULL DEFAULT 'VERLIEHEN',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleLoan_invoiceId_key" ON "SampleLoan"("invoiceId");
CREATE INDEX "SampleLoan_companyId_idx" ON "SampleLoan"("companyId");
CREATE INDEX "SampleLoan_status_idx" ON "SampleLoan"("status");

-- AddForeignKey
ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
