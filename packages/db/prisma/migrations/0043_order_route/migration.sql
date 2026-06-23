-- Auftrags-Workflow / Statusverwaltung: Produktionsroute + aktueller Schritt; Angebots-Feinstatus.
CREATE TYPE "OrderRoute" AS ENUM ('ROUTE1_KEINE', 'ROUTE2_INTERN', 'ROUTE3_EXTERN', 'ROUTE4_EXTERN_INTERN');
CREATE TYPE "QuoteWorkflowStage" AS ENUM ('ANFRAGE', 'ANGEBOT_ANGELEGT', 'VEREDLER_ANGEFRAGT', 'GEPRUEFT_FREIGEGEBEN', 'VERSENDET', 'GEWONNEN', 'VERLOREN');

ALTER TABLE "Order" ADD COLUMN "route" "OrderRoute";
ALTER TABLE "Order" ADD COLUMN "routeStepIndex" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Quote" ADD COLUMN "workflowStage" "QuoteWorkflowStage" NOT NULL DEFAULT 'ANGEBOT_ANGELEGT';
