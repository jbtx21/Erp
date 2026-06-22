-- Verkaufschance/Opportunity (komplexes CRM): gewichtete Pipeline.
CREATE TYPE "OpportunityStage" AS ENUM ('QUALIFIZIERUNG', 'ANGEBOT', 'VERHANDLUNG', 'ABSCHLUSS');
CREATE TYPE "OpportunityStatus" AS ENUM ('OFFEN', 'GEWONNEN', 'VERLOREN');

CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyId" TEXT,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'QUALIFIZIERUNG',
    "valueCents" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 10,
    "expectedCloseDate" TIMESTAMP(3),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OFFEN',
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
