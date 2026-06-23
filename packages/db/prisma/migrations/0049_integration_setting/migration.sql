-- Connector-Plattform: Registry der Fremdsystem-Anbindungen (Aktivierung + Konfig).
CREATE TABLE "IntegrationSetting" (
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("kind")
);
