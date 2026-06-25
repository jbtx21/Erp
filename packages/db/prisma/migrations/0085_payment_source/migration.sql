-- Vereinheitlichter Zahlungsabgleich (IA-Objekt-Merge): gemeinsames Abgleich-Datenmodell.
-- Additive Herkunfts-Spalte am Zahlungseingang (Strangler: alte Pfade bleiben grün).
CREATE TYPE "PaymentSource" AS ENUM ('CAMT', 'PROVIDER', 'MANUAL');

ALTER TABLE "Payment" ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL';

CREATE INDEX "Payment_source_idx" ON "Payment"("source");

-- Backfill: bereits importierte Bank-Zahlungen (mit Bank-Referenz) sind CAMT/Provider,
-- alles Übrige bleibt manuell. externalRef ist der verlässliche Diskriminator (T-13).
UPDATE "Payment" SET "source" = 'CAMT' WHERE "externalRef" IS NOT NULL;
