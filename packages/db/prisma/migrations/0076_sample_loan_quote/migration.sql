-- Muster-Leihgut einem Angebot zuordbar (B5): optionale quoteId an SampleLoan.
ALTER TABLE "SampleLoan" ADD COLUMN "quoteId" TEXT;
ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SampleLoan_quoteId_idx" ON "SampleLoan"("quoteId");
