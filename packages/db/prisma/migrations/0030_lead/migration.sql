-- B15: Lead/Interessent (Kap. 18.1) — Konvertierung zu Company

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEU', 'KONTAKTIERT', 'QUALIFIZIERT', 'KONVERTIERT', 'VERWORFEN');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "quelle" "InquirySource" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEU',
    "note" TEXT,
    "verworfenGrund" TEXT,
    "convertedCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedCompanyId_key" ON "Lead"("convertedCompanyId");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedCompanyId_fkey" FOREIGN KEY ("convertedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
