// Verknüpfte Belege: Auflösung + Finanz-Redaktion (PRODUKTION).

import { describe, expect, it } from "vitest";
import { LinksError, LinksService } from "./links.service.js";
import { InMemoryLinksRepository } from "../../repositories/in-memory-links.repository.js";

function setup(): LinksService {
  const repo = new InMemoryLinksRepository();
  repo.set("ord-1", {
    orderNumber: "AB-2026-0001",
    links: [
      { type: "Angebot", label: "AN-1 · ANGENOMMEN", navKey: "quotes", financial: false },
      { type: "Lieferschein", label: "LS-1", navKey: "orders", financial: false },
      { type: "Rechnung", label: "RE-1 · final", navKey: null, financial: true },
    ],
  });
  return new LinksService(repo);
}

describe("LinksService (Verknüpfte Belege)", () => {
  it("liefert alle verknüpften Belege eines Auftrags", async () => {
    const res = await setup().forOrder("ord-1");
    expect(res.orderNumber).toBe("AB-2026-0001");
    expect(res.links).toHaveLength(3);
    expect(res.links.map((l) => l.type)).toContain("Rechnung");
  });

  it("blendet Finanzbelege für PRODUKTION aus", async () => {
    const res = await setup().forOrder("ord-1", false);
    expect(res.links).toHaveLength(2);
    expect(res.links.some((l) => l.financial)).toBe(false);
    expect(res.links.some((l) => l.type === "Rechnung")).toBe(false);
  });

  it("wirft bei unbekanntem Auftrag", async () => {
    await expect(setup().forOrder("nope")).rejects.toBeInstanceOf(LinksError);
  });
});
