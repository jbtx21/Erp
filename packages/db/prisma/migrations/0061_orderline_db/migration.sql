-- Deckungsbeitrag je Auftragsposition (VK − EK, Snapshot zum Auftragszeitpunkt, Kap. 4.4).
ALTER TABLE "OrderLine" ADD COLUMN "dbCents" INTEGER;
