-- Referenz-Zeile für die neue Kundengruppe SCHULE (Preisgruppe). Eigene Migration, da
-- Postgres einen frisch per ADD VALUE angelegten Enum-Wert erst nach Commit verwenden darf.
INSERT INTO "PriceGroup" ("id", "kind", "name")
VALUES ('pg-schule', 'SCHULE', 'Schule')
ON CONFLICT ("kind") DO NOTHING;
