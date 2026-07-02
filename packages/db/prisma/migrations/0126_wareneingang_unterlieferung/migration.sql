-- Wareneingang: Unterlieferung abschließen (Kap. 6.3). Positionen können trotz
-- Fehlmenge geschlossen werden (closedShort) — sie zählen dann nicht mehr als offen
-- (Status-Fortschreibung + Bedarfsrechnung). closedShortAt markiert am Beleg, dass
-- die Bestellung mit Fehlmengen abgeschlossen wurde. Rein additiv, kein Backfill
-- nötig (Bestandsdaten: closedShort=false, closedShortAt=NULL = regulär offen).

ALTER TABLE "PurchaseOrderLine" ADD COLUMN "closedShort" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN "closedShortAt" TIMESTAMP(3);
