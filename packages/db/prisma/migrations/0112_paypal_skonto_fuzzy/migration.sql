-- Track A — quellen-agnostische Abgleich-Pipeline + Matching-Tiefe (Kap. 9.4).
-- 1) PaymentSource um PAYPAL erweitern (Brutto klärt OP, Gebühr separater Aufwand).
-- 2) Payment: PayPal-Gebühr + Fremdwährung mitführen; PaymentAllocation: gewährter Skonto.
-- 3) Performance-Indizes für Reconciliation/Dunning/Reporting bei wachsendem OP-Bestand.
-- Additiv — Bestand bleibt grün.

-- 1) Enum-Wert (PG12+: ADD VALUE ist transaktionssicher, solange er nicht im selben
--    Statement-Block verwendet wird — hier nur Deklaration).
ALTER TYPE "PaymentSource" ADD VALUE IF NOT EXISTS 'PAYPAL';

-- 2a) PayPal-Gebühr (separater Aufwand) + Fremdwährung am Zahlungseingang.
ALTER TABLE "Payment" ADD COLUMN "feeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR';

-- 2b) Gewährter Skonto je Allokation (schließt den OP zusätzlich zum Zahlbetrag;
--     DATEV bucht ihn als Erlösschmälerung).
ALTER TABLE "PaymentAllocation" ADD COLUMN "skontoCents" INTEGER NOT NULL DEFAULT 0;

-- 3a) Klärungsliste filtert Payment.matched=false + Herkunft.
CREATE INDEX "Payment_matched_source_idx" ON "Payment"("matched", "source");

-- 3b) Offene Posten: partieller Index auf die heiße Bedingung openCents > 0,
--     nach Fälligkeit sortiert (Reconciliation/Dunning/Aging). Vermeidet Full-Table-Scan,
--     wenn der OP-Bestand wächst (in Prisma nicht ausdrückbar → handgeschriebenes SQL).
CREATE INDEX "OpenItem_open_due_idx" ON "OpenItem"("dueDate") WHERE "openCents" > 0;
