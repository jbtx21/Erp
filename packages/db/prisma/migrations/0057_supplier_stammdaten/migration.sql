-- Lieferanten-Stammdaten 360° (Paket 1): Adresse + Konditionen + Ansprechpartner.
ALTER TABLE "Supplier"
  ADD COLUMN "street" TEXT,
  ADD COLUMN "zip" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'DE',
  ADD COLUMN "zahlungszielTage" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "skontoPercent" INTEGER,
  ADD COLUMN "skontoDays" INTEGER,
  ADD COLUMN "lieferzeitTage" INTEGER,
  ADD COLUMN "notiz" TEXT;

CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
