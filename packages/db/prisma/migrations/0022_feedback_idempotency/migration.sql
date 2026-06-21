-- B17: idempotente Nacherfassung von Produktionsrückmeldungen (Wiederanlauf, K-17)

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: @unique lässt mehrere NULL zu; verhindert Doppelerfassung
CREATE UNIQUE INDEX "TimeEntry_idempotencyKey_key" ON "TimeEntry"("idempotencyKey");
