-- Mehrartikel-Leihgut (Muster/Anprobe, verschiedene Lieferanten): Header wird mehrzeilig.
ALTER TABLE "SampleLoan" ALTER COLUMN "variantId" DROP NOT NULL;
ALTER TABLE "SampleLoan" ALTER COLUMN "menge" DROP NOT NULL;
ALTER TABLE "SampleLoan" ADD COLUMN "zweck" TEXT;

CREATE TABLE "SampleLoanLine" (
    "id" TEXT NOT NULL,
    "sampleLoanId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "variantId" TEXT,
    "supplierId" TEXT,
    "menge" INTEGER NOT NULL,
    CONSTRAINT "SampleLoanLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SampleLoanLine_sampleLoanId_idx" ON "SampleLoanLine"("sampleLoanId");
ALTER TABLE "SampleLoanLine" ADD CONSTRAINT "SampleLoanLine_sampleLoanId_fkey" FOREIGN KEY ("sampleLoanId") REFERENCES "SampleLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SampleLoanLine" ADD CONSTRAINT "SampleLoanLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
