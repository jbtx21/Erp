-- Abschlagsrechnung (Xentral): Teil-/Anzahlungsrechnung zu einem Auftrag (eigener Kreis AR-…).
CREATE TABLE "Abschlagsrechnung" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "percent" INTEGER,
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "bezahlt" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Abschlagsrechnung_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Abschlagsrechnung_number_key" ON "Abschlagsrechnung"("number");
CREATE INDEX "Abschlagsrechnung_orderId_idx" ON "Abschlagsrechnung"("orderId");
CREATE INDEX "Abschlagsrechnung_companyId_idx" ON "Abschlagsrechnung"("companyId");
ALTER TABLE "Abschlagsrechnung" ADD CONSTRAINT "Abschlagsrechnung_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Abschlagsrechnung" ADD CONSTRAINT "Abschlagsrechnung_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
