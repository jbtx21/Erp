-- Lieferdatum je Position (Order-to-make, Kap. 35): TEXMA hat kein Lager — nicht jede Variante ist
-- sofort lieferbar. Ein „verfügbar ab / zugesagt"-Datum JE POSITION (je Variante) treibt Teil-
-- produktion und Teillieferung. Additiv, nullable; bestehende Belege bleiben grün (null = sofort).
-- Kopf-Termine (Quote.wunschLiefertermin, Order.zugesagterLiefertermin) bleiben unberührt.
ALTER TABLE "QuoteLine"      ADD COLUMN "lieferdatum" TIMESTAMP(3);
ALTER TABLE "OrderLine"      ADD COLUMN "lieferdatum" TIMESTAMP(3);
ALTER TABLE "SampleLoanLine" ADD COLUMN "lieferdatum" TIMESTAMP(3);
