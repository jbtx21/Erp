// Mahnlauf (T-14): Eskalation +1 Stufe, Mahnsperre, bezahlte/nicht fällige Posten.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryDunningRepository, type SeedOpenItem } from "../../repositories/in-memory-dunning.repository.js";
import { DunningService } from "./dunning.service.js";

const oi = (over: Partial<SeedOpenItem>): SeedOpenItem => ({
  id: "oi",
  invoiceNumber: "R-1",
  openCents: 5000,
  dueDate: new Date(Date.UTC(2026, 4, 1)),
  dunningLevel: 0,
  mahnsperre: false,
  ...over,
});

const TODAY = new Date(Date.UTC(2026, 5, 15)); // ~45 Tage nach 01.05.

function setup(items: SeedOpenItem[]) {
  const repo = new InMemoryDunningRepository(items);
  return { repo, service: new DunningService(repo, new MemoryAuditSink()) };
}

describe("DunningService.runDunning (T-14)", () => {
  it("hebt einen überfälligen Posten um genau eine Stufe und schreibt sie fort", async () => {
    const { repo, service } = setup([oi({ id: "a", dunningLevel: 0 })]);
    const run = await service.runDunning(TODAY);
    expect(run.proposals).toEqual([{ itemId: "a", fromLevel: 0, toLevel: 1, daysOverdue: 45 }]);
    expect((await repo.listDunning(10))[0]).toMatchObject({ dunningLevel: 1 });
  });

  it("respektiert die Mahnsperre (kein Vorschlag, in blocked)", async () => {
    const { service } = setup([oi({ id: "b", mahnsperre: true })]);
    const run = await service.runDunning(TODAY);
    expect(run.proposals).toHaveLength(0);
    expect(run.blocked).toEqual(["b"]);
  });

  it("mahnt bezahlte oder noch nicht fällige Posten nicht", async () => {
    const { service } = setup([
      oi({ id: "paid", openCents: 0 }),
      oi({ id: "future", dueDate: new Date(Date.UTC(2026, 11, 1)) }),
    ]);
    const run = await service.runDunning(TODAY);
    expect(run.proposals).toHaveLength(0);
  });
});
