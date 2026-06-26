-- OrderLine.taxRatePct: USt-Satz je Auftragsposition, eingefroren zum Auftragszeitpunkt
-- (GoBD). Bisher ging der Satz aus dem Angebot (QuoteLine.taxRatePct, inkl. Steuerbefreiung
-- 0 %) bei der Auftragswandlung verloren — die Rechnung rechnete dann immer 19 %.
-- Backfill: Bestandszeilen erhalten 19 % (bisheriges faktisches Verhalten).
ALTER TABLE "OrderLine" ADD COLUMN "taxRatePct" INTEGER NOT NULL DEFAULT 19;
