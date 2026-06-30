-- Track B — FiBu-Export: kreditorische Seite + „bereits exportiert"-Guard (Kap. 9.2).
-- 1) Lieferanten-Kontierung für die Eingangsrechnungs-Buchung (Aufwand an Kreditor).
-- 2) DATEV-Export-Protokoll, damit Folge-Exporte bereits übernommene Belege überspringen.
-- Additiv — Bestand bleibt grün.

ALTER TABLE "Supplier" ADD COLUMN "kreditorenkonto" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "aufwandskonto" TEXT;

CREATE TABLE "DatevExportEntry" (
  "id"         TEXT NOT NULL,
  "belegart"   TEXT NOT NULL,
  "belegKey"   TEXT NOT NULL,
  "filename"   TEXT NOT NULL,
  "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DatevExportEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DatevExportEntry_belegart_belegKey_key" ON "DatevExportEntry"("belegart", "belegKey");
CREATE INDEX "DatevExportEntry_exportedAt_idx" ON "DatevExportEntry"("exportedAt");
