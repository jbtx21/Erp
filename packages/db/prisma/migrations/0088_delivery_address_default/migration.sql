-- Standard-Lieferadresse je Firma (Xentral-Benchmark): markiert die bei der
-- Belegerfassung vorzubelegende Lieferadresse. Genau eine je Firma (Teilindex).
ALTER TABLE "DeliveryAddress" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Bestandsdaten: je Firma die erste (älteste) Lieferadresse zur Standardadresse machen,
-- damit jede Firma mit >=1 Adresse eine eindeutige Vorbelegung hat.
WITH first_addr AS (
  SELECT DISTINCT ON ("companyId") id
  FROM "DeliveryAddress"
  ORDER BY "companyId", "id"
)
UPDATE "DeliveryAddress" d SET "isDefault" = true
FROM first_addr f WHERE d.id = f.id;

-- Höchstens eine Standard-Lieferadresse je Firma erzwingen.
CREATE UNIQUE INDEX "DeliveryAddress_default_per_company"
  ON "DeliveryAddress"("companyId") WHERE "isDefault";
