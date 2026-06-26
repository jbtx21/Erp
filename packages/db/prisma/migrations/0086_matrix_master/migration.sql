-- Matrixprodukt-Grundtabelle (Xentral-Vorbild): globaler Farb-/Größen-Stamm + Größenläufe.
CREATE TYPE "VariantAxis" AS ENUM ('FARBE', 'GROESSE');

CREATE TABLE "AxisValue" (
    "id" TEXT NOT NULL,
    "axis" "VariantAxis" NOT NULL,
    "value" TEXT NOT NULL,
    "skuSuffix" TEXT,
    "hex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AxisValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AxisValue_axis_value_key" ON "AxisValue"("axis", "value");
CREATE INDEX "AxisValue_axis_sortOrder_idx" ON "AxisValue"("axis", "sortOrder");

CREATE TABLE "SizeRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SizeRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SizeRun_name_key" ON "SizeRun"("name");

-- Starter-Stamm: Standard-Konfektionsgrößen (sortiert), gängige numerische Größen, Grundfarben.
INSERT INTO "AxisValue" (id, axis, value, "sortOrder", "createdAt") VALUES
  (gen_random_uuid()::text, 'GROESSE', 'XS', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', 'S', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', 'M', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', 'L', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', 'XL', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', 'XXL', 6, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '3XL', 7, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '4XL', 8, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '5XL', 9, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '44', 44, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '46', 46, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '48', 48, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '50', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '52', 52, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '54', 54, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GROESSE', '56', 56, CURRENT_TIMESTAMP);

INSERT INTO "AxisValue" (id, axis, value, hex, "sortOrder", "createdAt") VALUES
  (gen_random_uuid()::text, 'FARBE', 'Weiß', '#FFFFFF', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Schwarz', '#1A1A1A', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Navy', '#1B264F', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Grau', '#808080', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Rot', '#C0392B', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Royalblau', '#1F4E96', 6, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Grün', '#27632A', 7, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Gelb', '#F1C40F', 8, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Orange', '#E67E22', 9, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FARBE', 'Pink', '#E84393', 10, CURRENT_TIMESTAMP);

INSERT INTO "SizeRun" (id, name, values, "createdAt") VALUES
  (gen_random_uuid()::text, 'Standard Erwachsene', ARRAY['XS','S','M','L','XL','XXL'], CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Erweitert (bis 5XL)', ARRAY['XS','S','M','L','XL','XXL','3XL','4XL','5XL'], CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Hosengrößen', ARRAY['44','46','48','50','52','54','56'], CURRENT_TIMESTAMP);
