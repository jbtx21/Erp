import { describe, expect, it } from "vitest";
import { WorkflowError, WorkflowService } from "./workflow.service.js";
import { InMemoryWorkflowRepository } from "../../repositories/in-memory-workflow.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
class MemNotifier { sent: Array<{ recipient: string; title: string }> = []; async notify(recipient: string, title: string): Promise<unknown> { this.sent.push({ recipient, title }); return undefined; } }
function setup() { const repo = new InMemoryWorkflowRepository(); const notifier = new MemNotifier(); return { svc: new WorkflowService(repo, new MemAudit(), notifier), repo, notifier }; }

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

  it("benachrichtigt proaktiv, wenn ein automatisierbarer Schritt erreicht wird", async () => {
    const { svc, repo, notifier } = setup();
    repo.seed({ id: "o1", hasVeredelung: false, hasIntern: false, hasExtern: false }); // Route 1
    await svc.assignRoute("o1"); // Schritt 0 = angelegt (keine Aktion)
    const p = await svc.advance("o1", "buero@texma.de"); // Schritt 1 = Warenbestellvorschlag (Aktion!)
    expect(p.currentStep?.action).toBe("BESTELLVORSCHLAG");
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toMatchObject({ recipient: "buero@texma.de" });
    expect(notifier.sent[0]?.title).toContain("Warenbestellvorschlag");
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
