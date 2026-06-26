-- Veredelungsart Digitaldruck (DTG/DTF) als eigene Methode neben Siebdruck (DRUCK),
-- Stick und Transfer (B18). ADD VALUE ist in PG12+ außerhalb einer Transaktion nötig.
ALTER TYPE "FinishingMethod" ADD VALUE IF NOT EXISTS 'DRUCK_DIGITAL';
