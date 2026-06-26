-- Company.email: zentrale E-Mail der Firma für den Belegversand (Xentral-Benchmark).
-- Wird bei der Lead-Konvertierung aus der Lead-E-Mail übernommen, sonst manuell pflegbar.
ALTER TABLE "Company" ADD COLUMN "email" TEXT;
