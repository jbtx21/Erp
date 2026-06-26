-- Aufgaben↔Kalender-Verknüpfung: neue Kalender-Art AUFGABE + Quell-Referenz, damit
-- Aufgaben-Fälligkeiten als Kalendereinträge erscheinen und zweiseitig synchron bleiben.
ALTER TYPE "CalendarEventKind" ADD VALUE IF NOT EXISTS 'AUFGABE';
ALTER TABLE "CalendarEvent" ADD COLUMN "sourceEntity" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "sourceId" TEXT;
CREATE UNIQUE INDEX "CalendarEvent_sourceEntity_sourceId_key" ON "CalendarEvent"("sourceEntity", "sourceId");
