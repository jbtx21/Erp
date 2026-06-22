-- Personalisierte Dashboards: Besitzer je Mitarbeiter; Name nicht mehr global eindeutig.

ALTER TABLE "Dashboard" ADD COLUMN "ownerEmail" TEXT;
DROP INDEX "Dashboard_name_key";
CREATE INDEX "Dashboard_ownerEmail_idx" ON "Dashboard"("ownerEmail");
