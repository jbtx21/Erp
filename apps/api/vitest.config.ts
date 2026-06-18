import { defineConfig } from "vitest/config";
import { texmaAliases } from "../../vitest.shared.js";

export default defineConfig({
  resolve: { alias: texmaAliases },
  // Integrationstests teilen sich EINE Postgres-Instanz und greifen auf gemeinsame
  // Stammdaten (z. B. PriceGroup mit global eindeutigem `kind`) zu. Dateien daher
  // sequenziell ausführen, damit beforeAll/afterAll je Datei isoliert laufen und
  // keine Fixture-Kollisionen über parallele Worker entstehen. Unit-Tests sind
  // schnell, der serielle Lauf kostet kaum Zeit.
  test: { fileParallelism: false },
});
