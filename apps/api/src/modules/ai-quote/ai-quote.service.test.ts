// Unit-Test der KI-Freitexterfassung (B14) mit Stub-Extractor + In-Memory-Katalog.
// Mensch-Freigabe ist Pflicht — der Service erzeugt nie ein Angebot.

import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "@texma/shared";
import { InMemoryCatalogRepository } from "../../repositories/in-memory-catalog.repository.js";
import { AiQuoteDraftService, StubLlmExtractor } from "./ai-quote.service.js";

const catalog: CatalogEntry[] = [
  { variantId: "v1", sku: "POLO-NAVY-L", name: "Poloshirt Navy L", netCents: 1990 },
  { variantId: "v3", sku: "CAP-BLK", name: "Cap Schwarz", netCents: 990 },
];

function setup() {
  return new AiQuoteDraftService(new StubLlmExtractor(), new InMemoryCatalogRepository(catalog));
}

describe("AiQuoteDraftService.draftFromText (B14)", () => {
  it("extrahiert Freitext, validiert gegen den Katalog und verlangt Freigabe", async () => {
    const draft = await setup().draftFromText("10x CAP-BLK\n5x POLO-NAVY-L");
    expect(draft.requiresApproval).toBe(true);
    expect(draft.allMatched).toBe(true);
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ variantId: "v3", qty: 10, lineNetCents: 9900 });
    expect(draft.lines[1]).toMatchObject({ variantId: "v1", qty: 5, lineNetCents: 9950 });
  });

  it("markiert nicht zuordenbare Zeilen für die manuelle Prüfung", async () => {
    const draft = await setup().draftFromText("3x Schal Wolle");
    expect(draft.allMatched).toBe(false);
    expect(draft.lines[0]).toMatchObject({ query: "Schal Wolle", qty: 3, matched: false });
  });

  it("lehnt leeren Freitext ab", async () => {
    await expect(setup().draftFromText("   ")).rejects.toThrow();
  });
});
