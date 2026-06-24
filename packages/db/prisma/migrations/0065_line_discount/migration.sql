-- Artikelbezogener Positionsrabatt + VK-Listenpreis auf Angebots- und Auftragspositionen.
ALTER TABLE "QuoteLine" ADD COLUMN "listNetCents" INTEGER;
ALTER TABLE "QuoteLine" ADD COLUMN "rabattPct" INTEGER;
ALTER TABLE "OrderLine" ADD COLUMN "listNetCents" INTEGER;
ALTER TABLE "OrderLine" ADD COLUMN "rabattPct" INTEGER;
