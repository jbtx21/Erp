import { defineConfig } from "vitest/config";
import { texmaAliases } from "../../vitest.shared.js";

export default defineConfig({
  resolve: { alias: texmaAliases },
});
