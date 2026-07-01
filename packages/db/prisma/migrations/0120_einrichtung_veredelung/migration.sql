-- Einrichtungskosten der Veredelung (Kap. 4.4): FESTE Beträge — EK (unser Einkauf) und VK
-- (Kundenpreis), nicht gerechnet. Fallen nur unter der Stückzahl-Schwelle an (< 10 Teile,
-- einmalig je Position). Additiv/nullable: nur bei Veredelungsartikeln gepflegt; bestehende
-- Artikel bleiben unverändert (kein Backfill nötig).
ALTER TABLE "Article" ADD COLUMN "einrichtungEkCents" INTEGER;
ALTER TABLE "Article" ADD COLUMN "einrichtungVkCents" INTEGER;
