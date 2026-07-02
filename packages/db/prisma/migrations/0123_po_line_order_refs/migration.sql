-- 1-Klick-Bestellungen aus Auftragsbedarf (MTO, Kap. 6.1): Bedarfsquellen je
-- Bestellposition persistieren — welche Kundenaufträge/Muster-Leihen die bestellte
-- Menge ausgelöst haben (PO ↔ Auftrag rückverfolgbar). Abgrenzung zu T-12:
-- Mindestbestand-Bestellungen bekommen keine Quellen. Rein additiv, kein Backfill
-- nötig (Bestandspositionen ohne Quellen bleiben gültig).

CREATE TABLE "PurchaseOrderLineSource" (
  "id"                  TEXT NOT NULL,
  "purchaseOrderLineId" TEXT NOT NULL,
  "orderId"             TEXT,
  "ref"                 TEXT NOT NULL,
  "qty"                 INTEGER NOT NULL,
  CONSTRAINT "PurchaseOrderLineSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderLineSource_purchaseOrderLineId_idx" ON "PurchaseOrderLineSource"("purchaseOrderLineId");
CREATE INDEX "PurchaseOrderLineSource_orderId_idx" ON "PurchaseOrderLineSource"("orderId");
ALTER TABLE "PurchaseOrderLineSource" ADD CONSTRAINT "PurchaseOrderLineSource_purchaseOrderLineId_fkey"
  FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLineSource" ADD CONSTRAINT "PurchaseOrderLineSource_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
