-- Kunden-Stammdaten 360° (Paket 1): Rechnungsadresse + Steuerangaben + Zahlungs-/Lieferbedingungen.
ALTER TABLE "Company"
  ADD COLUMN "street" TEXT,
  ADD COLUMN "zip" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'DE',
  ADD COLUMN "vatId" TEXT,
  ADD COLUMN "taxNumber" TEXT,
  ADD COLUMN "skontoPercent" INTEGER,
  ADD COLUMN "skontoDays" INTEGER,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "lieferbedingung" TEXT,
  ADD COLUMN "notiz" TEXT,
  ADD COLUMN "kreditlimitCents" INTEGER;
