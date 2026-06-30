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

describe("PricingService.resolve — Lieferanten-Aufschlag als Grund-VK (Kap. 4.4)", () => {
  it("ohne manuellen Preis: berechneter Grund-VK (EK × Faktor) schlägt durch", async () => {
    const repo = new InMemoryPricingRepository();
    // computedBaseCents = EK 500 × 1,88 = 940 (vom Repo vorab berechnet).
    repo.set("co1", "v1", { group: "PREMIUM", customerTiers: [], groupTiers: [], groupPrices: [], computedBaseCents: 940 });
    const svc = new PricingService(repo, new MemoryAuditSink());
    expect(await svc.resolve("co1", "v1", 3)).toMatchObject({ netCents: 940, source: "LIEFERANT_AUFSCHLAG", minMenge: null });
  });

  it("manueller Einzelpreis der Gruppe übersteuert den berechneten Grund-VK", async () => {
    const repo = new InMemoryPricingRepository();
    repo.set("co1", "v1", {
      group: "PREMIUM", customerTiers: [], groupTiers: [],
      groupPrices: [{ priceGroup: "PREMIUM", netCents: 1111 }], computedBaseCents: 940,
    });
    const svc = new PricingService(repo, new MemoryAuditSink());
    expect(await svc.resolve("co1", "v1", 3)).toMatchObject({ netCents: 1111, source: "GRUPPE_EINZEL" });
  });
});

describe("PricingService — Lieferanten-Aufschlagsmatrix + Kundengruppe je Lieferant (CRUD)", () => {
  it("setSupplierMarkup speichert den Faktor (als Bp) und listet ihn zurück; auditiert", async () => {
    const repo = new InMemoryPricingRepository();
    const audit = new MemoryAuditSink();
    const svc = new PricingService(repo, audit);
    await svc.setSupplierMarkup("sup_hakro", "PREMIUM", 1.6);
    const rows = await svc.listSupplierMarkups("sup_hakro");
    expect(rows).toEqual([{ priceGroup: "PREMIUM", factorBp: 16000, factor: 1.6 }]);
    expect(audit.entries.at(-1)).toMatchObject({ entity: "SupplierMarkup" });
  });

  it("weist nicht-positive Faktoren ab", async () => {
    const svc = new PricingService(new InMemoryPricingRepository(), new MemoryAuditSink());
    await expect(svc.setSupplierMarkup("sup_hakro", "PREMIUM", 0)).rejects.toThrow();
  });

  it("setCustomerSupplierGroup ordnet je Lieferant zu (Premium@HAKRO, Standard@Stanley)", async () => {
    const repo = new InMemoryPricingRepository();
    repo.setSupplierName("sup_hakro", "HAKRO");
    repo.setSupplierName("sup_stanley", "Stanley/Stella");
    const svc = new PricingService(repo, new MemoryAuditSink());
    await svc.setCustomerSupplierGroup("co1", "sup_hakro", "PREMIUM");
    await svc.setCustomerSupplierGroup("co1", "sup_stanley", "STANDARD");
    const rows = await svc.listCustomerSupplierGroups("co1");
    expect(rows).toEqual(
      expect.arrayContaining([
        { supplierId: "sup_hakro", supplierName: "HAKRO", priceGroup: "PREMIUM" },
        { supplierId: "sup_stanley", supplierName: "Stanley/Stella", priceGroup: "STANDARD" },
      ])
    );
  });

  it("removeCustomerSupplierGroup entfernt die Zuordnung wieder", async () => {
    const repo = new InMemoryPricingRepository();
    const svc = new PricingService(repo, new MemoryAuditSink());
    await svc.setCustomerSupplierGroup("co1", "sup_hakro", "PREMIUM");
    await svc.removeCustomerSupplierGroup("co1", "sup_hakro");
    expect(await svc.listCustomerSupplierGroups("co1")).toHaveLength(0);
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

  it("nutzt die EK-Staffel je Stufe statt des flachen EK (Stick-EK gestaffelt)", async () => {
    const repo = new InMemoryPricingRepository();
    const svc = new PricingService(repo, new MemoryAuditSink());
    repo.setStandardTiers("vstick", [{ minMenge: 1, netCents: 821 }, { minMenge: 50, netCents: 603 }, { minMenge: 250, netCents: 539 }]);
    repo.setEk("vstick", 437); // flacher Fallback
    repo.setEkTiers("vstick", [{ minMenge: 1, ekCents: 437 }, { minMenge: 50, ekCents: 321 }, { minMenge: 250, ekCents: 287 }]);
    const { staffeln } = await svc.staffelpreise("co1", "vstick");
    expect(staffeln.map((s) => [s.minMenge, s.ekCents, s.dbCents])).toEqual([
      [1, 437, 821 - 437],
      [50, 321, 603 - 321],
      [250, 287, 539 - 287],
    ]);
  });
});
