-- Preis-Overhaul (Kap. 4.4/8.2): VK = EK × Aufschlagsfaktor(Lieferant × Kundengruppe).
-- Jeder Artikel hat genau EINEN (Textil-)Lieferanten; jeder Lieferant hat eigene Faktoren je
-- Kundengruppe; ein Kunde kann je Lieferant in einer anderen Gruppe sein. Additiv, Bestand grün.
-- (Die SCHULE-PriceGroup-Zeile folgt in 0116 — Postgres erlaubt die Nutzung eines neuen
--  Enum-Werts erst nach Commit von ADD VALUE.)

ALTER TYPE "PriceGroupKind" ADD VALUE IF NOT EXISTS 'SCHULE' BEFORE 'WIEDERVERKAEUFER';

-- Genau ein Lieferant je Artikel (DB nullable → Backfill; Pflicht auf Service-/UI-Ebene).
ALTER TABLE "Article" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "Article" ADD CONSTRAINT "Article_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill: vorhandener Hauptlieferant (SupplierItem priority 1) je Artikel.
UPDATE "Article" a SET "supplierId" = (
  SELECT si."supplierId" FROM "SupplierItem" si
  JOIN "Variant" v ON v."id" = si."variantId"
  WHERE v."articleId" = a."id"
  ORDER BY si."priority" ASC
  LIMIT 1
);
CREATE INDEX "Article_supplierId_idx" ON "Article"("supplierId");

-- Aufschlagsmatrix je Lieferant × Kundengruppe (flach). factorBp = Faktor × 10000 (1,88 → 18800).
CREATE TABLE "SupplierMarkup" (
  "id"           TEXT NOT NULL,
  "supplierId"   TEXT NOT NULL,
  "priceGroupId" TEXT NOT NULL,
  "factorBp"     INTEGER NOT NULL,
  CONSTRAINT "SupplierMarkup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierMarkup_supplierId_priceGroupId_key" ON "SupplierMarkup"("supplierId", "priceGroupId");
CREATE INDEX "SupplierMarkup_supplierId_idx" ON "SupplierMarkup"("supplierId");
ALTER TABLE "SupplierMarkup" ADD CONSTRAINT "SupplierMarkup_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierMarkup" ADD CONSTRAINT "SupplierMarkup_priceGroupId_fkey"
  FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kundengruppe je (Kunde × Lieferant): Premium@HAKRO, Standard@Stanley …
CREATE TABLE "CustomerSupplierPriceGroup" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "supplierId"   TEXT NOT NULL,
  "priceGroupId" TEXT NOT NULL,
  CONSTRAINT "CustomerSupplierPriceGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerSupplierPriceGroup_companyId_supplierId_key" ON "CustomerSupplierPriceGroup"("companyId", "supplierId");
CREATE INDEX "CustomerSupplierPriceGroup_supplierId_idx" ON "CustomerSupplierPriceGroup"("supplierId");
ALTER TABLE "CustomerSupplierPriceGroup" ADD CONSTRAINT "CustomerSupplierPriceGroup_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSupplierPriceGroup" ADD CONSTRAINT "CustomerSupplierPriceGroup_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSupplierPriceGroup" ADD CONSTRAINT "CustomerSupplierPriceGroup_priceGroupId_fkey"
  FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
