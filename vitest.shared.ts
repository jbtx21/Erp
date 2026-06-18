// Gemeinsame Vitest-Aliase: Workspace-Pakete auf ihre TS-Quelle mappen,
// damit Tests die @texma/* Pakete ohne Build auflösen.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export const texmaAliases = {
  "@texma/shared": resolve(root, "packages/shared/src/index.ts"),
  "@texma/audit": resolve(root, "packages/audit/src/index.ts"),
  "@texma/db": resolve(root, "packages/db/src/index.ts"),
  "@texma/orchestration": resolve(root, "packages/orchestration/src/index.ts"),
};
