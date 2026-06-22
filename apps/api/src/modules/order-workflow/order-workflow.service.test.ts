// Auftrags-Workflow (B9, Kap. 35.2): Status-Übergänge (F2-geprüft) + zugesagter
// Liefertermin. In-Memory, keine DB. Termin-/Statusänderungen werden auditiert (GoBD).

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import {
  OrderWorkflowError,
  OrderWorkflowService,
  type OrderWorkflowRepository,
} from "./order-workflow.service.js";

class FakeOrderRepo implements OrderWorkflowRepository {
  status = new Map<string, string>([["o1", "ANGELEGT"]]);
  delivery = new Map<string, Date | null>();
  async getStatus(id: string): Promise<string | null> {
    return this.status.get(id) ?? null;
  }
  async setStatus(id: string, status: string): Promise<void> {
    this.status.set(id, status);
  }
  async setDeliveryDate(id: string, date: Date | null): Promise<void> {
    this.delivery.set(id, date);
  }
}

function setup(): { repo: FakeOrderRepo; audit: MemoryAuditSink; svc: OrderWorkflowService } {
  const repo = new FakeOrderRepo();
  const audit = new MemoryAuditSink();
  return { repo, audit, svc: new OrderWorkflowService(repo, audit) };
}

describe("OrderWorkflowService.transition (F2, Kap. 35.2)", () => {
  it("schaltet einen legalen Übergang und auditiert ihn", async () => {
    const { repo, audit, svc } = setup();
    const res = await svc.transition("o1", "IN_BEARBEITUNG");
    expect(res.status).toBe("IN_BEARBEITUNG");
    expect(repo.status.get("o1")).toBe("IN_BEARBEITUNG");
    expect(audit.entries.at(-1)).toMatchObject({ entity: "Order", entityId: "o1", action: "UPDATE" });
  });

  it("blockiert einen illegalen Übergang", async () => {
    const { svc } = setup();
    await expect(svc.transition("o1", "VERSENDET")).rejects.toThrow();
  });

  it("wirft bei unbekanntem Auftrag", async () => {
    const { svc } = setup();
    await expect(svc.transition("nope", "IN_BEARBEITUNG")).rejects.toBeInstanceOf(OrderWorkflowError);
  });
});

describe("OrderWorkflowService.setDeliveryDate (B9, Liefertermin)", () => {
  it("setzt den zugesagten Liefertermin und auditiert die Zusage", async () => {
    const { repo, audit, svc } = setup();
    const d = new Date("2026-07-15T00:00:00.000Z");
    const res = await svc.setDeliveryDate("o1", d);
    expect(res.zugesagterLiefertermin).toEqual(d);
    expect(repo.delivery.get("o1")).toEqual(d);
    expect(audit.entries.at(-1)).toMatchObject({ entity: "Order", entityId: "o1", action: "UPDATE" });
  });

  it("entfernt den Termin bei null", async () => {
    const { repo, svc } = setup();
    await svc.setDeliveryDate("o1", new Date("2026-07-15T00:00:00.000Z"));
    await svc.setDeliveryDate("o1", null);
    expect(repo.delivery.get("o1")).toBeNull();
  });

  it("wirft bei unbekanntem Auftrag (kein stiller Schreiber)", async () => {
    const { svc } = setup();
    await expect(svc.setDeliveryDate("nope", new Date())).rejects.toBeInstanceOf(OrderWorkflowError);
  });
});
