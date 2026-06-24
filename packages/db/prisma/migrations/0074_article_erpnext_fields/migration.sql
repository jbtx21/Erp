-- Artikel-Stammblatt an ERPNext-Item angleichen (Textil-Subset, Kap. 31):
-- Artikelgruppe, Einheit, Verkauf/Einkauf-Flags, Mindestbestellmenge, Max.-Rabatt,
-- Lieferzeit + textilspezifische Felder (Gender/Flächengewicht/Passform).
ALTER TABLE "Article"
  ADD COLUMN "itemGroup" TEXT,
  ADD COLUMN "stockUom" TEXT NOT NULL DEFAULT 'Stk',
  ADD COLUMN "isSalesItem" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isPurchaseItem" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minOrderQty" INTEGER,
  ADD COLUMN "maxDiscountPct" INTEGER,
  ADD COLUMN "leadTimeDays" INTEGER,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "gm2" INTEGER,
  ADD COLUMN "styleFit" TEXT;
