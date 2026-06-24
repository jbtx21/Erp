-- Shop-/Kunden-Status-/Tracking-Rückmeldung (Kap. 4.2):
-- Carrier (Versanddienstleister) am Auftrag, Shopify-Shop-Art, Update-Strategie
-- (pushStatuses) + Kunden-Mail-Flag am ShopConnector.

-- Carrier-Enum
CREATE TYPE "Carrier" AS ENUM ('DPD', 'DHL', 'GLS', 'UPS', 'HERMES', 'SONSTIGE');

-- Shopify als generischer Shop-Adapter
ALTER TYPE "ShopKind" ADD VALUE 'SHOPIFY';

-- Auftrag: Versanddienstleister
ALTER TABLE "Order" ADD COLUMN "carrier" "Carrier";

-- ShopConnector: Update-Strategie + Kunden-Mail-Flag
ALTER TABLE "ShopConnector" ADD COLUMN "pushStatuses" "OrderStatus"[] DEFAULT ARRAY['VERSENDET', 'STORNIERT']::"OrderStatus"[];
ALTER TABLE "ShopConnector" ADD COLUMN "notifyCustomer" BOOLEAN NOT NULL DEFAULT true;
