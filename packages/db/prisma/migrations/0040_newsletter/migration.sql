-- Newsletter (Brevo): DSGVO-Opt-in am Kontakt + Kampagnen-Modell.
ALTER TABLE "Contact" ADD COLUMN "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "NewsletterStatus" AS ENUM ('ENTWURF', 'GESENDET');

CREATE TABLE "NewsletterCampaign" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'ENTWURF',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsletterCampaign_pkey" PRIMARY KEY ("id")
);
