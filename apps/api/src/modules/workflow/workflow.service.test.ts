import { describe, expect, it } from "vitest";
import { WorkflowError, WorkflowService } from "./workflow.service.js";
import { InMemoryWorkflowRepository } from "../../repositories/in-memory-workflow.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
function setup() { const repo = new InMemoryWorkflowRepository(); return { svc: new WorkflowService(repo, new MemAudit()), repo }; }

describe("WorkflowService (Statusverwaltung / Routen)", () => {
  it("weist die Route automatisch aus den Merkmalen zu", async () => {
    const { svc, repo } = setup();
    repo.seed({ id: "o1", hasVeredelung: false, hasIntern: false, hasExtern: false });
    expect((await svc.assignRoute("o1")).route).toBe("ROUTE1_KEINE");
    repo.seed({ id: "o2", hasVeredelung: true, hasIntern: true, hasExtern: true });
    expect((await svc.assignRoute("o2")).route).toBe("ROUTE4_EXTERN_INTERN");
  });

  it("schaltet Schritt für Schritt bis zum Ende weiter", async () => {
    const { svc, repo } = setup();
    repo.seed({ id: "o1", hasVeredelung: false, hasIntern: false, hasExtern: false });
    const start = await svc.assignRoute("o1"); // Route 1, 5 Schritte (Index 0..4)
    expect(start.currentStep?.key).toBe("angelegt");
    expect(start.totalSteps).toBe(5);
    let p = await svc.advance("o1");
    expect(p.currentStep?.key).toBe("bestellvorschlag");
    // noch 4 Schritte bis zum Abschluss (Index 1 → 5)
    for (let i = 0; i < 4; i++) p = await svc.advance("o1");
    expect(p.done).toBe(true);
    await expect(svc.advance("o1")).rejects.toBeInstanceOf(WorkflowError);
  });

  it("erlaubt explizite Routenwahl (Override)", async () => {
    const { svc, repo } = setup();
    repo.seed({ id: "o1", hasVeredelung: true, hasIntern: true, hasExtern: false });
    const p = await svc.assignRoute("o1", "ROUTE3_EXTERN");
    expect(p.route).toBe("ROUTE3_EXTERN");
  });

  it("Status null ohne Route, advance ohne Route wirft", async () => {
    const { svc, repo } = setup();
    repo.seed({ id: "o1", hasVeredelung: false, hasIntern: false, hasExtern: false });
    expect(await svc.status("o1")).toBeNull();
    await expect(svc.advance("o1")).rejects.toBeInstanceOf(WorkflowError);
  });
});
