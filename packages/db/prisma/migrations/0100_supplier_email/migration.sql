-- Zentrale E-Mail-Adresse je Lieferant/Veredler (für den Versand von Veredelungsaufträgen
-- per Mail an den Veredler, Kap. 5.3/5.4). Bisher nur je SupplierContact gepflegt.
ALTER TABLE "Supplier" ADD COLUMN "email" TEXT;
