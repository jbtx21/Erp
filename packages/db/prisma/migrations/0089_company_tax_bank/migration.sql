-- Kundenstamm Xentral-Benchmark: zentrale Steuerregel + Bankverbindung/SEPA-Mandat.
-- Steuerregel steuert die USt-Behandlung der Belege (zentral je Kunde, nicht je Position).
ALTER TABLE "Company" ADD COLUMN "taxRule" TEXT DEFAULT 'INLAND';
ALTER TABLE "Company" ADD COLUMN "iban" TEXT;
ALTER TABLE "Company" ADD COLUMN "bic" TEXT;
ALTER TABLE "Company" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Company" ADD COLUMN "sepaMandateRef" TEXT;
ALTER TABLE "Company" ADD COLUMN "sepaMandateDate" TEXT;

-- Bestandskunden: Default-Steuerregel Inland setzen (NULL → INLAND), damit Belege
-- eine definierte Steuerbehandlung haben.
UPDATE "Company" SET "taxRule" = 'INLAND' WHERE "taxRule" IS NULL;
