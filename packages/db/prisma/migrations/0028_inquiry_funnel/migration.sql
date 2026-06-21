-- B20: Anfrage/RFQ-Funnel (Kap. 18.1/35.1)

-- CreateEnum
CREATE TYPE "InquirySource" AS ENUM ('WEB', 'EMAIL', 'SHOP', 'TELEFON');
CREATE TYPE "InquiryStatus" AS ENUM ('NEU', 'IN_BEARBEITUNG', 'ANGEBOT', 'VERWORFEN');

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT,
    "kontaktName" TEXT,
    "quelle" "InquirySource" NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEU',
    "verworfenGrund" TEXT,
    "text" TEXT NOT NULL,
    "quoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_number_key" ON "Inquiry"("number");
CREATE UNIQUE INDEX "Inquiry_quoteId_key" ON "Inquiry"("quoteId");
CREATE INDEX "Inquiry_status_idx" ON "Inquiry"("status");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
