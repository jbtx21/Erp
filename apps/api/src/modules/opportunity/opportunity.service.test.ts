import { describe, expect, it } from "vitest";
import { OpportunityError, OpportunityService, StubCrmProvider } from "./opportunity.service.js";
import { InMemoryOpportunityRepository } from "../../repositories/in-memory-opportunity.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

function setup() {
  const repo = new InMemoryOpportunityRepository();
  const crm = new StubCrmProvider();
  const svc = new OpportunityService(repo, new MemAudit(), crm);
  return { svc, repo, crm };
}

describe("OpportunityService (komplexes CRM)", () => {
  it("legt eine Chance an mit Phasen-Standardwahrscheinlichkeit", async () => {
    const { svc, repo } = setup();
    await svc.create({ title: "Großauftrag Polos", valueCents: 500000, stage: "ANGEBOT" });
    expect(repo.items[0]?.probability).toBe(40);
  });

  it("liefert gewichtete Pipeline", async () => {
    const { svc } = setup();
    await svc.create({ title: "A", valueCents: 100000, stage: "ANGEBOT", probability: 40 });
    await svc.create({ title: "B", valueCents: 200000, stage: "VERHANDLUNG", probability: 70 });
    const p = await svc.pipeline();
    expect(p.openCount).toBe(2);
    expect(p.forecastCents).toBe(40000 + 140000);
  });

  it("Phasenwechsel hebt die Wahrscheinlichkeit und spiegelt ins CRM", async () => {
    const { svc, repo, crm } = setup();
    const { id } = await svc.create({ title: "A", stage: "QUALIFIZIERUNG", probability: 10 });
    await svc.advanceStage(id, "VERHANDLUNG");
    expect(repo.items[0]?.probability).toBe(70);
    expect(crm.deals).toContain(id);
  });

  it("gewonnen/verloren schließt die Chance ab; weitere Änderungen verboten", async () => {
    const { svc } = setup();
    const a = await svc.create({ title: "A" });
    await svc.markWon(a.id);
    await expect(svc.advanceStage(a.id, "ABSCHLUSS")).rejects.toBeInstanceOf(OpportunityError);

    const b = await svc.create({ title: "B" });
    await expect(svc.markLost(b.id, "")).rejects.toBeInstanceOf(OpportunityError);
    await svc.markLost(b.id, "Preis zu hoch");
  });
});
