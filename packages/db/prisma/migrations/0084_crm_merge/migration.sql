-- Vereinheitlichter CRM-Funnel (IA-Merge, Strangler): eine Entität + eine Statusmaschine.
CREATE TYPE "CrmStage" AS ENUM ('NEU', 'KONTAKTIERT', 'QUALIFIZIERT', 'ANGEBOT', 'GEWONNEN', 'VERLOREN');

CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "InquirySource",
    "stage" "CrmStage" NOT NULL DEFAULT 'NEU',
    "valueCents" INTEGER,
    "probability" INTEGER,
    "expectedCloseAt" TIMESTAMP(3),
    "text" TEXT,
    "note" TEXT,
    "lostReason" TEXT,
    "quoteId" TEXT,
    "legacyKind" TEXT,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrmLead_stage_idx" ON "CrmLead"("stage");
CREATE INDEX "CrmLead_companyId_idx" ON "CrmLead"("companyId");
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill LEAD → CrmLead
INSERT INTO "CrmLead" (id, name, "companyId", email, phone, source, stage, note, "lostReason", "legacyKind", "legacyId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, COALESCE(NULLIF(l.name, ''), l.firma, 'Lead'), l."convertedCompanyId", l.email, l.phone, l.quelle,
  (CASE l.status WHEN 'NEU' THEN 'NEU' WHEN 'KONTAKTIERT' THEN 'KONTAKTIERT' WHEN 'QUALIFIZIERT' THEN 'QUALIFIZIERT' WHEN 'KONVERTIERT' THEN 'GEWONNEN' ELSE 'VERLOREN' END)::"CrmStage",
  l.note, l."verworfenGrund", 'LEAD', l.id, l."createdAt", l."createdAt"
FROM "Lead" l;

-- Backfill INQUIRY → CrmLead
INSERT INTO "CrmLead" (id, name, "companyId", "contactName", source, stage, text, "lostReason", "quoteId", "legacyKind", "legacyId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, COALESCE(NULLIF(i."kontaktName", ''), i.number), i."companyId", i."kontaktName", i.quelle,
  (CASE i.status WHEN 'ANGEBOT' THEN 'ANGEBOT' WHEN 'VERWORFEN' THEN 'VERLOREN' ELSE 'QUALIFIZIERT' END)::"CrmStage",
  i.text, i."verworfenGrund", i."quoteId", 'INQUIRY', i.id, i."createdAt", i."createdAt"
FROM "Inquiry" i;

-- Backfill OPPORTUNITY → CrmLead
INSERT INTO "CrmLead" (id, name, "companyId", stage, "valueCents", probability, "expectedCloseAt", "lostReason", "legacyKind", "legacyId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o.title, o."companyId",
  (CASE o.status WHEN 'GEWONNEN' THEN 'GEWONNEN' WHEN 'VERLOREN' THEN 'VERLOREN'
    ELSE (CASE o.stage WHEN 'QUALIFIZIERUNG' THEN 'QUALIFIZIERT' ELSE 'ANGEBOT' END) END)::"CrmStage",
  o."valueCents", o.probability, o."expectedCloseDate", o."lostReason", 'OPPORTUNITY', o.id, o."createdAt", o."createdAt"
FROM "Opportunity" o;
