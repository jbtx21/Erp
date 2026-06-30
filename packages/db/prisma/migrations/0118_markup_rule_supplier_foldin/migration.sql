-- Phase 1 (Variante A), Slice 1B: Fold-in von SupplierMarkup in die EINE Regel-Engine.
-- MarkupRule bekommt eine Lieferanten-Bedingung; jede SupplierMarkup-Zeile wird als Aufschlags-
-- regel (supplierId × priceGroupId → factor) kopiert. Additiv, Strangler: die SupplierMarkup-
-- Tabelle und der Altpfad bleiben vorerst grün; Umstellung der Auflösung folgt in 1C, das
-- Entfernen in 1D. factor = factorBp / 10000 (z. B. 18800 → 1,88).
ALTER TABLE "MarkupRule" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "MarkupRule" ADD CONSTRAINT "MarkupRule_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "MarkupRule_supplierId_idx" ON "MarkupRule"("supplierId");

INSERT INTO "MarkupRule" ("id", "factor", "label", "priceGroupId", "supplierId", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       sm."factorBp"::float / 10000.0,
       'Lieferanten-Aufschlag',
       sm."priceGroupId",
       sm."supplierId",
       0,
       now(),
       now()
FROM "SupplierMarkup" sm;
