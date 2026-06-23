import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryTaskRepository } from "../../repositories/in-memory-task.repository.js";
import { TaskError, TaskService } from "./task.service.js";

function setup() {
  const service = new TaskService(new InMemoryTaskRepository(), new MemoryAuditSink());
  return { service };
}

describe("TaskService", () => {
  it("legt eine Aufgabe an und listet sie in der Arbeitsliste der Person", async () => {
    const { service } = setup();
    await service.create({ title: "Auftrag prüfen", assigneeEmail: "a@texma-gmbh.de", entity: "Order", entityId: "o1", navKey: "orders" });
    const list = await service.listForUser("a@texma-gmbh.de");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Auftrag prüfen", status: "OFFEN", entity: "Order", entityId: "o1" });
    expect(await service.openCount("a@texma-gmbh.de")).toBe(1);
  });

  it("Erledigen entfernt die Aufgabe aus der offenen Liste", async () => {
    const { service } = setup();
    const { id } = await service.create({ title: "x", assigneeEmail: "a@texma-gmbh.de" });
    await service.complete(id);
    expect(await service.listForUser("a@texma-gmbh.de")).toHaveLength(0);
    expect(await service.listForUser("a@texma-gmbh.de", true)).toHaveLength(1);
    expect(await service.openCount("a@texma-gmbh.de")).toBe(0);
  });

  it("Neuzuweisen verschiebt die Aufgabe in die andere Arbeitsliste", async () => {
    const { service } = setup();
    const { id } = await service.create({ title: "x", assigneeEmail: "a@texma-gmbh.de" });
    await service.reassign(id, "b@texma-gmbh.de");
    expect(await service.listForUser("a@texma-gmbh.de")).toHaveLength(0);
    expect(await service.listForUser("b@texma-gmbh.de")).toHaveLength(1);
  });

  it("listForEntity liefert die Aufgaben eines Belegs", async () => {
    const { service } = setup();
    await service.create({ title: "x", assigneeEmail: "a@texma-gmbh.de", entity: "Order", entityId: "o1" });
    await service.create({ title: "y", assigneeEmail: "b@texma-gmbh.de", entity: "Order", entityId: "o1" });
    expect(await service.listForEntity("Order", "o1")).toHaveLength(2);
  });

  it("verlangt Titel und Empfänger", async () => {
    const { service } = setup();
    await expect(service.create({ title: "  ", assigneeEmail: "a@texma-gmbh.de" })).rejects.toBeInstanceOf(TaskError);
    await expect(service.create({ title: "x", assigneeEmail: "" })).rejects.toBeInstanceOf(TaskError);
  });
});
