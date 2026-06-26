-- Bestandsführung als Artikel-/Varianten-Eigenschaft (Procure-to-Order).
-- Default: KEIN Bestand (negative/beliebige Mengen okay). Nur ausgewählte Artikel
-- (z. B. Transferdrucke) werden bewusst auf bestandsgeführt geschaltet.
ALTER TABLE "Article" ADD COLUMN "bestandsgefuehrt" BOOLEAN NOT NULL DEFAULT false;
-- Varianten-Override (NULL = erbt vom Hauptartikel).
ALTER TABLE "Variant" ADD COLUMN "bestandsgefuehrtOverride" BOOLEAN;
