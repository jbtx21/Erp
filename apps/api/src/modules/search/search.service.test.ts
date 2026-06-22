// Globale Suche (G-6): entitätsübergreifend, case-insensitive, ab 2 Zeichen.

import { describe, expect, it } from "vitest";
import { InMemorySearchRepository } from "../../repositories/in-memory-search.repository.js";
import { SearchService } from "./search.service.js";

function setup(): SearchService {
  const repo = new InMemorySearchRepository({
    companies: [{ id: "c1", name: "Muster GmbH", branche: "Textil" }],
    suppliers: [{ id: "s1", name: "Stick-Meister", kind: "VEREDLER" }],
    orders: [{ id: "o1", number: "WC-1001", externalNumber: "1001", status: "ANGELEGT" }],
    variants: [{ id: "v1", sku: "POLO-BLAU-XL", articleName: "Poloshirt" }],
    leads: [{ id: "l1", name: "Max Mustermann", email: "max@example.de" }],
  });
  return new SearchService(repo);
}

describe("SearchService.global (G-6)", () => {
  it("findet entitätsübergreifend und liefert Navigationsziel", async () => {
    const hits = await setup().global("muster");
    const entities = hits.map((h) => h.entity).sort();
    expect(entities).toContain("Firma"); // Muster GmbH
    expect(entities).toContain("Lead"); // Max Mustermann
    expect(hits.find((h) => h.entity === "Firma")?.navKey).toBe("companies");
  });

  it("ist case-insensitive und sucht in mehreren Feldern", async () => {
    expect(await setup().global("polo")).toHaveLength(1); // Variante per SKU
    expect((await setup().global("1001")).some((h) => h.entity === "Auftrag")).toBe(true); // Order per externalNumber
  });

  it("liefert nichts unter 2 Zeichen (kein Volldurchlauf)", async () => {
    expect(await setup().global("m")).toEqual([]);
    expect(await setup().global("  ")).toEqual([]);
  });

  it("respektiert das Limit", async () => {
    expect((await setup().global("e", 0 + 2)).length).toBeLessThanOrEqual(2);
  });
});
