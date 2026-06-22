-- ERP-Grundfunktion G-5: In-App-Benachrichtigungen + E-Mail-/Text-Vorlagen.

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "navKey" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipient_read_idx" ON "Notification"("recipient", "read");
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");
