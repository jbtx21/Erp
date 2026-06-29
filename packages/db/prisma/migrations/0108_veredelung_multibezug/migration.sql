-- Veredelungsbezug zu MEHREREN Textilpositionen (B): bezugPosition Int? → bezugPositionen Int[].
-- Eine Veredelung kann sich auf mehrere Textilpositionen beziehen; die Veredelungsmenge
-- korreliert mit der Summe der zugewiesenen Textilmengen (Kap. 5.4/11).
-- Strangler-Abschluss: additive Array-Spalte, Backfill aus der Einzelspalte, alte Spalte droppen.

-- QuoteLine
ALTER TABLE "QuoteLine" ADD COLUMN "bezugPositionen" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
UPDATE "QuoteLine" SET "bezugPositionen" = ARRAY["bezugPosition"] WHERE "bezugPosition" IS NOT NULL;
ALTER TABLE "QuoteLine" DROP COLUMN "bezugPosition";

-- OrderLine
ALTER TABLE "OrderLine" ADD COLUMN "bezugPositionen" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
UPDATE "OrderLine" SET "bezugPositionen" = ARRAY["bezugPosition"] WHERE "bezugPosition" IS NOT NULL;
ALTER TABLE "OrderLine" DROP COLUMN "bezugPosition";
