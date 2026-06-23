import { describe, expect, it, vi } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryAutomationRepository } from "../../repositories/in-memory-automation.repository.js";
import { type ActionHandler, AutomationError, AutomationService } from "./automation.service.js";

function setup(handlers: Record<string, ActionHandler>) {
  const repo = new InMemoryAutomationRepository();
  const service = new AutomationService(repo, handlers, new MemoryAuditSink());
  return { service, repo };
}

describe("AutomationService", () => {
  it("feuert eine passende Regel und führt die Aktion mit aufgelösten Platzhaltern aus", async () => {
    const notify = vi.fn<ActionHandler>(async () => undefined);
    const { service } = setup({ notify });
    await service.create({
      name: "Versand-Mail",
      triggerEvent: "order.status.changed",
      conditions: [{ field: "status", op: "eq", value: "VERSENDET" }],
      actions: [{ type: "notify", params: { to: "{{userEmail}}", title: "Auftrag {{number}} versendet" } }],
    });

    const fired = await service.handleEvent("order.status.changed", { status: "VERSENDET", number: "AB-7", userEmail: "a@texma-gmbh.de" });
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ ok: true, type: "notify" });
    expect(notify).toHaveBeenCalledWith({ to: "a@texma-gmbh.de", title: "Auftrag AB-7 versendet" });
  });

  it("feuert NICHT, wenn die Bedingung nicht erfüllt ist", async () => {
    const notify = vi.fn<ActionHandler>(async () => undefined);
    const { service } = setup({ notify });
    await service.create({ name: "x", triggerEvent: "order.status.changed", conditions: [{ field: "status", op: "eq", value: "VERSENDET" }], actions: [{ type: "notify", params: {} }] });
    await service.handleEvent("order.status.changed", { status: "ANGELEGT" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("inaktive Regeln feuern nicht", async () => {
    const notify = vi.fn<ActionHandler>(async () => undefined);
    const { service, repo } = setup({ notify });
    const { id } = await service.create({ name: "x", triggerEvent: "lead.created", conditions: [], actions: [{ type: "notify", params: {} }] });
    await service.setActive(id, false);
    await service.handleEvent("lead.created", {});
    expect(notify).not.toHaveBeenCalled();
    void repo;
  });

  it("eine fehlschlagende Aktion stoppt die übrigen nicht", async () => {
    const boom = vi.fn<ActionHandler>(async () => { throw new Error("Slack down"); });
    const notify = vi.fn<ActionHandler>(async () => undefined);
    const { service } = setup({ slack: boom, notify });
    await service.create({ name: "x", triggerEvent: "lead.created", conditions: [], actions: [{ type: "slack", params: {} }, { type: "notify", params: {} }] });
    const fired = await service.handleEvent("lead.created", {});
    expect(fired.map((f) => f.ok)).toEqual([false, true]);
    expect(notify).toHaveBeenCalled();
  });

  it("lehnt unbekannte Trigger und Aktionen ab", async () => {
    const { service } = setup({ notify: async () => undefined });
    await expect(service.create({ name: "x", triggerEvent: "nope.event", conditions: [], actions: [] })).rejects.toBeInstanceOf(AutomationError);
    await expect(service.create({ name: "x", triggerEvent: "lead.created", conditions: [], actions: [{ type: "carrier-pigeon", params: {} }] })).rejects.toBeInstanceOf(AutomationError);
  });
});
