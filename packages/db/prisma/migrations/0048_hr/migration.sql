-- Personalwesen (HR): Mitarbeiter + Urlaubsanträge.
CREATE TYPE "VacationStatus" AS ENUM ('BEANTRAGT', 'GENEHMIGT', 'ABGELEHNT');

CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "position" TEXT,
    "eintrittAm" TIMESTAMP(3),
    "urlaubstageJahr" INTEGER NOT NULL DEFAULT 30,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

CREATE TABLE "VacationRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "vonDatum" TIMESTAMP(3) NOT NULL,
    "bisDatum" TIMESTAMP(3) NOT NULL,
    "tage" INTEGER NOT NULL,
    "status" "VacationStatus" NOT NULL DEFAULT 'BEANTRAGT',
    "grund" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VacationRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VacationRequest_employeeId_idx" ON "VacationRequest"("employeeId");
CREATE INDEX "VacationRequest_status_idx" ON "VacationRequest"("status");
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
