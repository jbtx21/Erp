-- Phase 1 (Variante A), Slice 1D: SupplierMarkup entfernen. Die Lieferanten-Aufschläge wurden in
-- 0118 verlustfrei in MarkupRule überführt (supplierId × priceGroupId, finishingType=null) und der
-- Code liest/schreibt seit 1C nur noch MarkupRule. Eine Engine, eine Tabelle — Duplikation entfernt.
DROP TABLE IF EXISTS "SupplierMarkup";
