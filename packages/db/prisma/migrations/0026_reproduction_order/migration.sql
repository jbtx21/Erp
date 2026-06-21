-- B11: Nachproduktions-Auftrag aus Reklamation — Verweis auf Ursprungsauftrag (Kap. 20)

ALTER TABLE "Order" ADD COLUMN "nachproduktionVonId" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_nachproduktionVonId_fkey" FOREIGN KEY ("nachproduktionVonId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
