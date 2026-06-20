-- Konfigurierbarer Aufschlagsfaktor (Kap. 4.4): Logo-Override + globaler Default + Regeln

-- AlterTable: Aufschlagsfaktor-Override je Logo
ALTER TABLE "LogoVersion" ADD COLUMN "markupFactor" DOUBLE PRECISION;

-- CreateTable: globaler Standardfaktor (Singleton id=GLOBAL)
CREATE TABLE "MarkupConfig" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "defaultFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.88,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Aufschlags-Regeln je Parameter
CREATE TABLE "MarkupRule" (
    "id" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "priceGroupId" TEXT,
    "finishingType" TEXT,
    "minMenge" INTEGER,
    "maxMenge" INTEGER,
    "minEkCents" INTEGER,
    "maxEkCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkupRule_pkey" PRIMARY KEY ("id")
);
