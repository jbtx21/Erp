-- Fremdvergabe-Beistellung aus dem Veredelungsbezug (Kap. 5.4/11, T-04):
-- welche Textilpositionen gehen an den Veredler (Parallel-/Sequenz-Gate).
ALTER TABLE "SubProductionOrder" ADD COLUMN "beistellInfo" TEXT;
ALTER TABLE "SubProductionOrder" ADD COLUMN "beistellPositionen" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
