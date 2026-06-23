-- Contact-Dynamic-Link (CRM): Person ↔ mehrere Parteien (polymorph).
CREATE TABLE "ContactLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactLink_contactId_entity_entityId_key" ON "ContactLink"("contactId", "entity", "entityId");
CREATE INDEX "ContactLink_entity_entityId_idx" ON "ContactLink"("entity", "entityId");
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
