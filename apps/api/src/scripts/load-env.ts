// Lädt Umgebungsvariablen (v. a. DATABASE_URL) aus packages/db/.env — derselben
// Datei, die auch die Prisma-CLI nutzt. So laufen dev-server und seed ohne manuelles
// Setzen von Umgebungsvariablen (wichtig unter Windows). Muss als ERSTER Import in
// den Skripten stehen, damit die Werte vor dem ersten Prisma-Zugriff gesetzt sind.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // …/apps/api/dist/scripts
// dist/scripts → Repo-Wurzel (../../../..) → packages/db/.env
config({ path: resolve(here, "../../../../packages/db/.env") });
// Optionales Root-.env zusätzlich (überschreibt vorhandene Werte NICHT).
config();
