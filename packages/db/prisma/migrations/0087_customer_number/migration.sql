-- Sprechende Kundennummer (KD-JJJJ-NNNN) als zentraler Stammdaten-Schlüssel (Xentral-Benchmark).
ALTER TABLE "Company" ADD COLUMN "customerNumber" TEXT;

-- Backfill: je Anlagejahr fortlaufend nach createdAt, vierstellig.
WITH ranked AS (
  SELECT id,
         EXTRACT(YEAR FROM "createdAt")::int AS yr,
         row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt") ORDER BY "createdAt", id) AS rn
  FROM "Company"
)
UPDATE "Company" c
SET "customerNumber" = 'KD-' || r.yr::text || '-' || lpad(r.rn::text, 4, '0')
FROM ranked r
WHERE c.id = r.id;

CREATE UNIQUE INDEX "Company_customerNumber_key" ON "Company"("customerNumber");

-- Nummernkreis-Zähler je Jahr auf das vergebene Maximum setzen, damit neu angelegte
-- Kunden nicht mit den Backfill-Nummern kollidieren.
INSERT INTO "NumberSequence" ("key", "year", "next")
SELECT 'CUSTOMER', r.yr, max(r.rn)
FROM (
  SELECT EXTRACT(YEAR FROM "createdAt")::int AS yr,
         row_number() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt") ORDER BY "createdAt", id) AS rn
  FROM "Company"
) r
GROUP BY r.yr
ON CONFLICT ("key", "year") DO UPDATE SET "next" = GREATEST("NumberSequence"."next", EXCLUDED."next");
