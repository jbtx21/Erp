// Preisfindung mit Mengenstaffel (B4, Kap. 4.4 / T-15): Präzedenz Kunde > Gruppen-
// Staffel > Einzelpreis, Stufenwahl an der Mengengrenze, Staffelpflege (auditiert).
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryPricingRepository } from "../../repositories/in-memory-pricing.repository.js";
import { PricingService } from "./pricing.service.js";

function setup(): { repo: InMemoryPricingRepository; audit: MemoryAuditSink; svc: PricingService } {
  const repo = new InMemoryPricingRepository();
  repo.set("co1", "v1", {
    group: "STANDARD",
    customerTiers: [{ minMenge: 10, netCents: 800 }],
    groupTiers: [{ minMenge: 1, netCents: 1000 }, { minMenge: 10, netCents: 900 }],
    groupPrices: [{ priceGroup: "STANDARD", netCents: 1200 }],
  });
  const audit = new MemoryAuditSink();
  return { repo, audit, svc: new PricingService(repo, audit) };
}

describe("PricingService.resolve (T-15, Präzedenz + Stufe)", () => {
  it("Menge 5: keine Kundenstaffel (min 10) → Gruppen-Staffel Stufe 1 (1000)", async () => {
    const { svc } = setup();
    expect(await svc.resolve("co1", "v1", 5)).toEqual({ netCents: 1000, source: "GRUPPE_STAFFEL", minMenge: 1, ekCents: null, dbCents: null, dbMargePct: null });
  });

  it("Menge 10: kundenindividuelle Staffel sticht (800)", async () => {
    const { svc } = setup();
    expect(await svc.resolve("co1", "v1", 10)).toEqual({ netCents: 800, source: "KUNDE", minMenge: 10, ekCents: null, dbCents: null, dbMargePct: null });
  });

  it("ohne jede Staffel: Einzelpreis der Gruppe", async () => {
    const repo = new InMemoryPricingRepository();
    repo.set("co1", "v1", { group: "STANDARD", customerTiers: [], groupTiers: [], groupPrices: [{ priceGroup: "STANDARD", netCents: 1200 }] });
    const svc = new PricingService(repo, new MemoryAuditSink());
    expect(await svc.resolve("co1", "v1", 3)).toEqual({ netCents: 1200, source: "GRUPPE_EINZEL", minMenge: null, ekCents: null, dbCents: null, dbMargePct: null });
  });

  it("Deckungsbeitrag: mit Lieferanten-EK liefert DB + Marge (Kap. 4.4)", async () => {
    const { repo, svc } = setup();
    repo.setEk("v1", 600); // bester EK 6,00 €
    // Menge 10 → Kundenstaffel 800. DB = 800 − 600 = 200; Marge = 200/800 = 0,25.
    expect(await svc.resolve("co1", "v1", 10)).toMatchObject({ netCents: 800, ekCents: 600, dbCents: 200, dbMargePct: 0.25 });
  });

  it("Pflegefehler (kein Preis) wird sichtbar geworfen (T-08)", async () => {
    const repo = new InMemoryPricingRepository();
    repo.set("co1", "v1", { group: "STANDARD", customerTiers: [], groupTiers: [], groupPrices: [] });
    const svc = new PricingService(repo, new MemoryAuditSink());
    await expect(svc.resolve("co1", "v1", 3)).rejects.toThrow();
  });
});

describe("PricingService.addGroupTier (B4, Staffelpflege)", () => {
  it("legt eine Gruppen-Staffelstufe an, wirkt sofort und auditiert", async () => {
    // Ohne Kundenstaffel, damit die neue Gruppenstufe greift (Kunde stäche sonst, s. Präzedenz).
    const repo = new InMemoryPricingRepository();
    repo.set("co1", "v1", { group: "STANDARD", customerTiers: [], groupTiers: [{ minMenge: 1, netCents: 1000 }], groupPrices: [] });
    const audit = new MemoryAuditSink();
    const svc = new PricingService(repo, audit);
    await svc.addGroupTier("co1", "v1", 50, 750);
    expect(await svc.resolve("co1", "v1", 60)).toMatchObject({ netCents: 750, source: "GRUPPE_STAFFEL", minMenge: 50 });
    expect(audit.entries.at(-1)).toMatchObject({ entity: "PriceGroupPriceTier", action: "CREATE" });
  });

  it("listTiers gibt kunden- und gruppenindividuelle Stufen zurück", async () => {
    const { svc } = setup();
    const t = await svc.listTiers("co1", "v1");
    expect(t.customerTiers).toHaveLength(1);
    expect(t.groupTiers).toHaveLength(2);
  });

  it("weist ungültige Eingaben ab", async () => {
    const { svc } = setup();
    await expect(svc.addGroupTier("co1", "v1", 0, 750)).rejects.toThrow();
    await expect(svc.addGroupTier("co1", "v1", 10, -1)).rejects.toThrow();
  });
});

describe("PricingService.staffelpreise (C+D — Anzeige-Staffel VK+EK+DB)", () => {
  it("mergt STANDARD-Basis + Gruppe + Kunde und ergänzt EK + DB je Stufe", async () => {
    const { repo, svc } = setup(); // groupTiers 1→1000, 10→900; customer 10→800
    repo.setStandardTiers("v1", [{ minMenge: 1, netCents: 1100 }, { minMenge: 100, netCents: 700 }]);
    repo.setEk("v1", 600);
    const { ekCents, staffeln } = await svc.staffelpreise("co1", "v1");
    expect(ekCents).toBe(600);
    // Stufe 1 von GRUPPE (sticht STANDARD), Stufe 10 von KUNDE, Stufe 100 von STANDARD.
    expect(staffeln.map((s) => [s.minMenge, s.vkCents, s.quelle, s.dbCents])).toEqual([
      [1, 1000, "GRUPPE", 400],
      [10, 800, "KUNDE", 200],
      [100, 700, "STANDARD", 100],
    ]);
  });
});
