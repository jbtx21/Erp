-- Maileingang: eindeutige Mail-Message-ID je Anfrage (Idempotenz beim IMAP-Import).
ALTER TABLE "Inquiry" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Inquiry_externalRef_key" ON "Inquiry"("externalRef");
