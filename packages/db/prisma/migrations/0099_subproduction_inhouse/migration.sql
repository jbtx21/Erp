-- Inhouse-Veredelungsschritt als Fremdvergabe-Stufe ohne externen Veredler (Kap. 5.4/11, T-04):
-- z. B. 2-farbiger Transferdruck im Haus, läuft nach dem externen Rücklauf am selben Textil.
ALTER TABLE "SubProductionOrder" ALTER COLUMN "supplierId" DROP NOT NULL;
ALTER TABLE "SubProductionOrder" ADD COLUMN "inhouse" BOOLEAN NOT NULL DEFAULT false;
