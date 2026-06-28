-- EK-Abgleich beim Wareneingang (Kap. 9.6): EK je Stück laut Lieferschein/Eingang erfassen,
-- damit er gegen den Bestell-EK (PurchaseOrderLine.ekCents) geprüft werden kann. Additiv.
ALTER TABLE "GoodsReceiptLine" ADD COLUMN IF NOT EXISTS "ekCents" INTEGER;
