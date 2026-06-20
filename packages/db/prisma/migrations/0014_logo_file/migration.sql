-- Hochgeladene Stickdatei je Logo-Version (beliebiges Format, Kap. 7.1), inline in der DB
ALTER TABLE "LogoVersion" ADD COLUMN "fileName" TEXT;
ALTER TABLE "LogoVersion" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "LogoVersion" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "LogoVersion" ADD COLUMN "fileData" BYTEA;
