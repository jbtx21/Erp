-- Lead um B2B-Vertriebsfelder ergänzen: Firma, Webseite, Verantwortlicher (Owner).
ALTER TABLE "Lead" ADD COLUMN "firma" TEXT;
ALTER TABLE "Lead" ADD COLUMN "webseite" TEXT;
ALTER TABLE "Lead" ADD COLUMN "verantwortlicher" TEXT;
