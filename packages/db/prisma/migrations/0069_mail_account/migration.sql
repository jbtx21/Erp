-- Multi-Mailkonten (IONOS-Postfächer): mehrere Konten, je eines Standard ein-/ausgehend,
-- Passwort AES-256-GCM-verschlüsselt.
CREATE TABLE "MailAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emailAddress" TEXT NOT NULL,
  "imapHost" TEXT NOT NULL DEFAULT 'imap.ionos.de',
  "imapPort" INTEGER NOT NULL DEFAULT 993,
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.ionos.de',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "username" TEXT,
  "passwordEnc" TEXT,
  "enableIncoming" BOOLEAN NOT NULL DEFAULT true,
  "enableOutgoing" BOOLEAN NOT NULL DEFAULT true,
  "defaultIncoming" BOOLEAN NOT NULL DEFAULT false,
  "defaultOutgoing" BOOLEAN NOT NULL DEFAULT false,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailAccount_emailAddress_key" ON "MailAccount"("emailAddress");
CREATE INDEX "MailAccount_defaultOutgoing_idx" ON "MailAccount"("defaultOutgoing");
CREATE INDEX "MailAccount_defaultIncoming_idx" ON "MailAccount"("defaultIncoming");
