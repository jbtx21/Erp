// Datensatz-Querschnitt (ERP-Grundfunktion): Kommentare/Aktivitäten/Anhänge sind
// polymorph (entity, entityId) gebunden; Schreibzugriffe werden auditiert; Validierung
// weist Leeres ab. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryCollaborationRepository } from "../../repositories/in-memory-collaboration.repository.js";
import { CollaborationError, CollaborationService } from "./collaboration.service.js";

function setup(): { audit: MemoryAuditSink; svc: CollaborationService } {
  const audit = new MemoryAuditSink();
  return { audit, svc: new CollaborationService(new InMemoryCollaborationRepository(), audit) };
}

describe("CollaborationService — Kommentare", () => {
  it("hängt einen Kommentar an einen Datensatz und auditiert", async () => {
    const { svc, audit } = setup();
    const c = await svc.addComment("Order", "o1", "bob@texma.de", "  bitte vorziehen  ");
    expect(c.text).toBe("bitte vorziehen"); // getrimmt
    expect(await svc.listComments("Order", "o1")).toHaveLength(1);
    expect(await svc.listComments("Order", "o2")).toHaveLength(0); // andere Entität getrennt
    expect(audit.entries.at(-1)).toMatchObject({ entity: "Order", entityId: "o1" });
  });

  it("weist leere Kommentare ab", async () => {
    const { svc } = setup();
    await expect(svc.addComment("Order", "o1", "bob", "   ")).rejects.toBeInstanceOf(CollaborationError);
  });
});

describe("CollaborationService — Aktivitäten (was ist als Nächstes)", () => {
  it("legt eine Aufgabe an und kann sie abhaken", async () => {
    const { svc } = setup();
    const a = await svc.addActivity("Company", "c1", "bob", { kind: "TASK", title: "Nachfassen", dueDate: new Date("2026-07-01") });
    expect(a.done).toBe(false);
    const done = await svc.setActivityDone(a.id, true);
    expect(done.done).toBe(true);
    expect((await svc.listActivities("Company", "c1"))[0]?.done).toBe(true);
  });

  it("wirft beim Abhaken einer unbekannten Aktivität", async () => {
    const { svc } = setup();
    await expect(svc.setActivityDone("nope", true)).rejects.toBeInstanceOf(CollaborationError);
  });
});

describe("CollaborationService — Anhänge", () => {
  it("hängt eine Datei (Metadaten/Verweis) an und trennt nach Entität", async () => {
    const { svc } = setup();
    await svc.addAttachment("Order", "o1", "bob", { fileName: "druckdaten.pdf", mimeType: "application/pdf", url: "s3://x" });
    expect(await svc.listAttachments("Order", "o1")).toHaveLength(1);
    await expect(svc.addAttachment("Order", "o1", "bob", { fileName: "", mimeType: null, url: "s3://x" })).rejects.toBeInstanceOf(CollaborationError);
    await expect(svc.addAttachment("Order", "o1", "bob", { fileName: "x", mimeType: null, url: "" })).rejects.toBeInstanceOf(CollaborationError);
  });
});
