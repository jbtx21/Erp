-- Kundenstamm Xentral-Benchmark: Liefersperre + Zuordnungs-/Buchhaltungsfelder.
-- Liefersperre blockt den Versand (gesperrte Kunden werden aus der Versandliste
-- ausgeschlossen). Belegsprache/Währung/Debitorenkonto/Betreuer als Stammdaten.
ALTER TABLE "Company" ADD COLUMN "liefersperre" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "liefersperreGrund" TEXT;
ALTER TABLE "Company" ADD COLUMN "debitorenkonto" TEXT;
ALTER TABLE "Company" ADD COLUMN "belegsprache" TEXT DEFAULT 'DE';
ALTER TABLE "Company" ADD COLUMN "waehrung" TEXT DEFAULT 'EUR';
ALTER TABLE "Company" ADD COLUMN "betreuer" TEXT;
