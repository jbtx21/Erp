// Telefon-Modul / Anrufprotokoll — In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryCallLogRepository } from "../../repositories/in-memory-call-log.repository.js";
import { CallLogError, CallLogService } from "./call-log.service.js";

function setup() {
  const repo = new InMemoryCallLogRepository({ "c-1": "TSV Emden" });
  return { repo, service: new CallLogService(repo, new MemoryAuditSink()) };
}

describe("CallLogService (Telefon-Modul)", () => {
  it("erfasst einen Anruf mit Firma und listet ihn (neueste zuerst)", async () => {
    const { service } = setup();
    await service.create({ richtung: "EINGEHEND", telefonnummer: "+49 4921 1", grund: "Rückfrage Logo", companyId: "c-1", zeitpunkt: new Date("2026-06-01") });
    await service.create({ richtung: "AUSGEHEND", telefonnummer: "+49 4921 2", grund: "Angebot nachfassen", zeitpunkt: new Date("2026-06-10") });
    const rows = await service.list();
    expect(rows.map((r) => r.grund)).toEqual(["Angebot nachfassen", "Rückfrage Logo"]);
    expect(rows[1]).toMatchObject({ companyId: "c-1", companyName: "TSV Emden", richtung: "EINGEHEND" });
  });

  it("verlangt Telefonnummer und Grund", async () => {
    const { service } = setup();
    await expect(service.create({ richtung: "EINGEHEND", telefonnummer: "  ", grund: "x" })).rejects.toBeInstanceOf(CallLogError);
    await expect(service.create({ richtung: "EINGEHEND", telefonnummer: "123", grund: "  " })).rejects.toBeInstanceOf(CallLogError);
  });

  it("lehnt negative Dauer ab", async () => {
    const { service } = setup();
    await expect(service.create({ richtung: "AUSGEHEND", telefonnummer: "123", grund: "x", dauerSek: -5 })).rejects.toBeInstanceOf(CallLogError);
  });

  it("verfolgt offene Rückrufe über den Status", async () => {
    const { service } = setup();
    const { id } = await service.create({ richtung: "EINGEHEND", telefonnummer: "123", grund: "bitte zurückrufen", status: "RUECKRUF" });
    expect(await service.openCallbackCount()).toBe(1);
    expect((await service.list({ status: "RUECKRUF" })).length).toBe(1);
    await service.setStatus(id, "ERLEDIGT");
    expect(await service.openCallbackCount()).toBe(0);
  });
});
