-- Aufgabe/Zuweisung (Assigned To/ToDo): persönliche Arbeitsliste, optional beleggekoppelt.
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "navKey" TEXT,
    "assigneeEmail" TEXT NOT NULL,
    "createdBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFEN',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Task_assigneeEmail_status_idx" ON "Task"("assigneeEmail", "status");
CREATE INDEX "Task_entity_entityId_idx" ON "Task"("entity", "entityId");
