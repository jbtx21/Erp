import { describe, expect, it } from "vitest";
import { matchCatalog, resolveDraft, type CatalogEntry } from "./ai-draft.js";

const catalog: CatalogEntry[] = [
  { variantId: "v1", sku: "POLO-NAVY-L", name: "Poloshirt Navy L", netCents: 1990 },
  { variantId: "v2", sku: "POLO-NAVY-M", name: "Poloshirt Navy M", netCents: 1990 },
  { variantId: "v3", sku: "CAP-BLK", name: "Cap Schwarz", netCents: 990 },
];

describe("matchCatalog (B14)", () => {
  it("trifft per exakter SKU und exaktem Namen", () => {
    expect(matchCatalog("POLO-NAVY-L", catalog)?.variantId).toBe("v1");
    expect(matchCatalog("Cap Schwarz", catalog)?.variantId).toBe("v3");
  });

  it("trifft eindeutigen Teiltreffer im NAMEN, lehnt mehrdeutige ab", () => {
    expect(matchCatalog("Cap", catalog)?.variantId).toBe("v3"); // eindeutig
    expect(matchCatalog("Poloshirt Navy", catalog)).toBeUndefined(); // v1+v2 mehrdeutig
  });

  it("löst eine spezifischere Nicht-Katalog-SKU NICHT auf eine kürzere SKU auf", () => {
    // "CAP-BLK-XL" existiert nicht; darf nicht fälschlich auf "CAP-BLK" matchen.
    expect(matchCatalog("CAP-BLK-XL", catalog)).toBeUndefined();
  });

  it("ignoriert Katalogeinträge mit leerer SKU beim Matching", () => {
    const withEmpty = [...catalog, { variantId: "vx", sku: "", name: "Sonderposten", netCents: 100 }];
    expect(matchCatalog("irgendwas ohne Treffer", withEmpty)).toBeUndefined();
  });
});

describe("resolveDraft (B14)", () => {
  it("löst zuordenbare Zeilen auf und rechnet Positionsnetto", () => {
    const r = resolveDraft({ lines: [{ query: "CAP-BLK", qty: 10 }] }, catalog);
    expect(r.requiresApproval).toBe(true);
    expect(r.allMatched).toBe(true);
    expect(r.lines[0]).toMatchObject({ variantId: "v3", netCents: 990, lineNetCents: 9900, matched: true });
  });

  it("markiert nicht zuordenbare und mengenlose Zeilen", () => {
    const r = resolveDraft({ lines: [{ query: "Poloshirt Navy", qty: 5 }, { query: "CAP-BLK", qty: 0 }] }, catalog);
    expect(r.allMatched).toBe(false);
    expect(r.lines.every((l) => !l.matched)).toBe(true);
  });

  it("verlangt IMMER Freigabe (auch bei voll aufgelöstem Entwurf)", () => {
    const r = resolveDraft({ lines: [{ query: "POLO-NAVY-L", qty: 1 }] }, catalog);
    expect(r.requiresApproval).toBe(true);
  });

  it("leerer Entwurf ist nicht allMatched", () => {
    expect(resolveDraft({ lines: [] }, catalog).allMatched).toBe(false);
  });
});
