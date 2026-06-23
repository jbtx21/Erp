-- Büro-Kalender (Termine/Urlaub/Abwesenheiten) + Mitarbeiter-Nachrichtenportal.
CREATE TYPE "CalendarEventKind" AS ENUM ('TERMIN', 'URLAUB', 'ABWESENHEIT', 'SONSTIGES');

CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "kind" "CalendarEventKind" NOT NULL DEFAULT 'TERMIN',
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEvent_ownerEmail_idx" ON "CalendarEvent"("ownerEmail");
CREATE INDEX "CalendarEvent_start_idx" ON "CalendarEvent"("start");

CREATE TABLE "InternalMessage" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalMessage_toEmail_read_idx" ON "InternalMessage"("toEmail", "read");
CREATE INDEX "InternalMessage_fromEmail_idx" ON "InternalMessage"("fromEmail");
