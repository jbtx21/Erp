-- Eilauftrag-Priorisierung (Xentral „Fast-Lane"): bevorzugte Bearbeitung in der Auftragsliste.
ALTER TABLE "Order" ADD COLUMN "fastLane" BOOLEAN NOT NULL DEFAULT false;
