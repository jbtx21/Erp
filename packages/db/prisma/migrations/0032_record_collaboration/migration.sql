-- ERP-Grundfunktion: generischer Datensatz-Querschnitt (Kommentare/Aktivitäten/Anhänge)
-- polymorph über (entity, entityId). Siehe docs/erp-grundfunktionen.md.

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('TASK', 'EVENT');

-- CreateTable
CREATE TABLE "RecordComment" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordActivity" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAttachment" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "url" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordComment_entity_entityId_idx" ON "RecordComment"("entity", "entityId");
CREATE INDEX "RecordActivity_entity_entityId_idx" ON "RecordActivity"("entity", "entityId");
CREATE INDEX "RecordAttachment_entity_entityId_idx" ON "RecordAttachment"("entity", "entityId");
