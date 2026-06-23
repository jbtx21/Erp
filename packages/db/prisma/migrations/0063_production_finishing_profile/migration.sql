-- Gewählter Veredelungsweg am Produktionsauftrag (Werktage-Durchlaufzeit, Kap. 35.2).
ALTER TABLE "ProductionOrder" ADD COLUMN "finishingProfile" TEXT;
