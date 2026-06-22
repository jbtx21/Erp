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
    expect(await svc.resolve("co1", "v1", 5)).toEqual({ netCents: 1000, source: "GRUPPE_STAFFEL", minMenge: 1 });
  });

  it("Menge 10: kundenindividuelle Staffel sticht (800)", async () => {
    const { svc } = setup();
    expect(await svc.resolve("co1", "v1", 10)).toEqual({ netCents: 800, source: "KUNDE", minMenge: 10 });
  });

  it("ohne jede Staffel: Einzelpreis der Gruppe", async () => {
    const repo = new InMemoryPricingRepository();
    repo.set("co1", "v1", { group: "STANDARD", customerTiers: [], groupTiers: [], groupPrices: [{ priceGroup: "STANDARD", netCents: 1200 }] });
    const svc = new PricingService(repo, new MemoryAuditSink());
    expect(await svc.resolve("co1", "v1", 3)).toEqual({ netCents: 1200, source: "GRUPPE_EINZEL", minMenge: null });
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
