-- Shop-Sicherheitspuffer je Variante (Pseudo-Bestand, Xentral-Vorbild).
-- An den Shop gemeldeter Bestand = max(0, verfügbar(HAUPT) − shopPuffer).
ALTER TABLE "Variant" ADD COLUMN "shopPuffer" INTEGER NOT NULL DEFAULT 0;
