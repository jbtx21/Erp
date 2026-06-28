-- Eingangsrechnungs-Workflow (GetMyInvoices-Vorbild, Kap. 9.4): Positionen für den
-- EK-Abgleich, Zahlungskonditionen (Fälligkeit/Skonto), EK-Check + Zahlungsfreigabe.

-- Neuer Status FREIGEGEBEN (nach EK-Abgleich zur Zahlung freigegeben).
ALTER TYPE "IncomingInvoiceStatus" ADD VALUE IF NOT EXISTS 'FREIGEGEBEN';

-- EK-Abgleich-Status + Herkunft.
DO $$ BEGIN
  CREATE TYPE "EkCheckStatus" AS ENUM ('OFFEN', 'OK', 'ABWEICHUNG', 'PRUEFUNG');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "IncomingInvoiceSource" AS ENUM ('E_RECHNUNG', 'OCR', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- IncomingInvoice: Herkunft/Quellbeleg, Konditionen, EK-Check + Freigabe.
ALTER TABLE "IncomingInvoice"
  ADD COLUMN IF NOT EXISTS "source" "IncomingInvoiceSource" NOT NULL DEFAULT 'E_RECHNUNG',
  ADD COLUMN IF NOT EXISTS "eInvoiceXml" TEXT,
  ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "skontoPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "skontoDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "skontoUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ekCheckStatus" "EkCheckStatus" NOT NULL DEFAULT 'OFFEN',
  ADD COLUMN IF NOT EXISTS "freigegebenVon" TEXT,
  ADD COLUMN IF NOT EXISTS "freigegebenAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentAmountCents" INTEGER;

-- Rechnungspositionen für den EK-Abgleich.
CREATE TABLE IF NOT EXISTS "IncomingInvoiceLine" (
  "id" TEXT NOT NULL,
  "incomingInvoiceId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "supplierSku" TEXT,
  "variantId" TEXT,
  "qty" INTEGER NOT NULL,
  "unitEkCents" INTEGER NOT NULL,
  "lineNetCents" INTEGER NOT NULL,
  CONSTRAINT "IncomingInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncomingInvoiceLine_incomingInvoiceId_idx" ON "IncomingInvoiceLine"("incomingInvoiceId");

ALTER TABLE "IncomingInvoiceLine"
  ADD CONSTRAINT "IncomingInvoiceLine_incomingInvoiceId_fkey"
  FOREIGN KEY ("incomingInvoiceId") REFERENCES "IncomingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncomingInvoiceLine"
  ADD CONSTRAINT "IncomingInvoiceLine_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
