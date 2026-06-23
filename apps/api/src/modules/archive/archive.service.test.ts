import { sha256Hex } from "@texma/shared";
import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryArchiveRepository } from "../../repositories/in-memory-archive.repository.js";
import { ArchiveError, ArchiveService } from "./archive.service.js";
import { InMemoryObjectStore } from "./object-store.js";

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

function setup() {
  const store = new InMemoryObjectStore();
  const repo = new InMemoryArchiveRepository();
  const audit = new MemoryAuditSink();
  const service = new ArchiveService(store, repo, audit, () => new Date("2026-06-23T10:00:00.000Z"));
  return { service, store, repo, audit };
}

describe("ArchiveService", () => {
  it("archiviert einen Beleg WORM mit Aufbewahrungsfrist", async () => {
    const { service } = setup();
    const meta = await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("inhalt") });
    expect(meta.sha256).toBe(sha256Hex(bytes("inhalt")));
    expect(meta.retentionClass).toBe("BOOKING_10Y");
    expect(meta.earliestDeletion.getUTCFullYear()).toBe(2036);
    expect(meta.version).toBe(1);
  });

  it("ist idempotent: identischer Inhalt für dieselbe Quelle ⇒ kein zweiter Eintrag", async () => {
    const { service, repo } = setup();
    const a = await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("x") });
    const b = await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("x") });
    expect(b.id).toBe(a.id);
    expect((await repo.list(10))).toHaveLength(1);
  });

  it("neue Fassung desselben Belegs erhöht die Version", async () => {
    const { service } = setup();
    await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("v1") });
    const v2 = await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("v2") });
    expect(v2.version).toBe(2);
  });

  it("retrieve liefert die Bytes und prüft den Hash", async () => {
    const { service } = setup();
    const meta = await service.archive({ belegart: "ANGEBOT", sourceEntity: "Quote", sourceId: "AN-1", fileName: "an.pdf", contentType: "application/pdf", data: bytes("hallo") });
    const got = await service.retrieve(meta.id);
    expect(new TextDecoder().decode(got!.data)).toBe("hallo");
  });

  it("retrieve erkennt fehlende/manipulierte Bytes (Integritätsverstoß)", async () => {
    const { service, repo } = setup();
    const meta = await service.archive({ belegart: "ANGEBOT", sourceEntity: "Quote", sourceId: "AN-1", fileName: "an.pdf", contentType: "application/pdf", data: bytes("original") });
    // Register zeigt auf einen Hash, zu dem keine (bzw. abweichende) Bytes existieren.
    (await repo.findById(meta.id))!.sha256 = sha256Hex(bytes("ein-anderer-inhalt"));
    await expect(service.retrieve(meta.id)).rejects.toBeInstanceOf(ArchiveError);
  });

  it("leerer Beleg wird abgelehnt", async () => {
    const { service } = setup();
    await expect(service.archive({ belegart: "ANGEBOT", sourceEntity: "Quote", sourceId: "AN-2", fileName: "x", contentType: "text/plain", data: bytes("") })).rejects.toBeInstanceOf(ArchiveError);
  });

  it("Legal Hold setzen", async () => {
    const { service, repo } = setup();
    const meta = await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("x") });
    await service.setLegalHold(meta.id, true);
    expect((await repo.findById(meta.id))?.legalHold).toBe(true);
  });

  it("GoBD-Export liefert index.xml + manifest.csv mit allen Belegen des Zeitraums", async () => {
    const { service } = setup();
    await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-1", fileName: "re1.pdf", contentType: "application/pdf", data: bytes("a") });
    await service.archive({ belegart: "RECHNUNG", sourceEntity: "Invoice", sourceId: "RE-2", fileName: "re2.pdf", contentType: "application/pdf", data: bytes("b") });
    const exp = await service.buildGobdExport({});
    expect(exp.count).toBe(2);
    expect(exp.indexXml).toContain("gdpdu-01-09-2004.dtd");
    expect(exp.manifestCsv.split("\r\n")).toHaveLength(3); // Kopf + 2
  });
});
