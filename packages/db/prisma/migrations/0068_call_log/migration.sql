-- Telefon-Modul: Anrufprotokoll (wer/wann/weswegen), optional je Firma, mit Rückruf-Status.
CREATE TYPE "CallDirection" AS ENUM ('EINGEHEND', 'AUSGEHEND');
CREATE TYPE "CallStatus" AS ENUM ('ERLEDIGT', 'OFFEN', 'RUECKRUF');

CREATE TABLE "CallLog" (
  "id" TEXT NOT NULL,
  "richtung" "CallDirection" NOT NULL,
  "telefonnummer" TEXT NOT NULL,
  "kontaktName" TEXT,
  "companyId" TEXT,
  "bearbeiter" TEXT,
  "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dauerSek" INTEGER,
  "grund" TEXT NOT NULL,
  "ergebnis" TEXT,
  "status" "CallStatus" NOT NULL DEFAULT 'ERLEDIGT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CallLog_companyId_idx" ON "CallLog"("companyId");
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");
CREATE INDEX "CallLog_zeitpunkt_idx" ON "CallLog"("zeitpunkt");
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
