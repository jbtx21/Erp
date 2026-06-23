-- Angebot (Quotation): Bestellart, Angebot-für (polymorph) und AGB-Text persistieren.
ALTER TABLE "Quote"
  ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'SALES',
  ADD COLUMN "quotationTo" TEXT NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "terms" TEXT;
