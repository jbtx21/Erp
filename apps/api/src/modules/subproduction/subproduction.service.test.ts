// Mehrstufige Fremdvergabe (T-04): sequenzielles Gate + erlaubte/unerlaubte Übergänge.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { SubProductionTransitionError } from "@texma/shared";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemorySubProductionRepository } from "../../repositories/in-memory-subproduction.repository.js";
import { type StoredStage, SubProductionService } from "./subproduction.service.js";

const stage = (id: string, sequence: number, status: StoredStage["status"]): StoredStage => ({
  id,
  productionId: "pa",
  sequence,
  supplierId: `sup_${sequence}`,
  status,
  beistellungVersandtAm: null,
  ruecklaufErhaltenAm: null,
});

function setup() {
  const repo = new InMemorySubProductionRepository([
    stage("s1", 1, "OFFEN"),
    stage("s2", 2, "OFFEN"),
  ]);
  return { repo, service: new SubProductionService(repo, new MemoryAuditSink()) };
}

describe("SubProductionService.advanceStage (T-04)", () => {
  it("blockiert Stufe 2, solange Stufe 1 nicht zurück ist", async () => {
    const { service } = setup();
    await expect(service.advanceStage("s2", "BEISTELLUNG_VERSANDT")).rejects.toBeInstanceOf(
      SubProductionTransitionError
    );
  });

  it("lässt Stufe 2 nach Rücklauf von Stufe 1 starten und setzt den Zeitstempel", async () => {
    const { service } = setup();
    const at = new Date(Date.UTC(2026, 5, 1));
    await service.advanceStage("s1", "BEISTELLUNG_VERSANDT", at);
    await service.advanceStage("s1", "RUECKLAUF_ERHALTEN", at);
    const s2 = await service.advanceStage("s2", "BEISTELLUNG_VERSANDT", at);
    expect(s2.status).toBe("BEISTELLUNG_VERSANDT");
    expect(s2.beistellungVersandtAm).toEqual(at);
  });

  it("weist unerlaubte Übergänge ab", async () => {
    const { service } = setup();
    await expect(service.advanceStage("s1", "RUECKLAUF_ERHALTEN")).rejects.toBeInstanceOf(
      SubProductionTransitionError
    );
  });

  it("meldet allReturned, sobald alle Stufen zurück sind", async () => {
    const { service } = setup();
    const at = new Date();
    await service.advanceStage("s1", "BEISTELLUNG_VERSANDT", at);
    await service.advanceStage("s1", "RUECKLAUF_ERHALTEN", at);
    await service.advanceStage("s2", "BEISTELLUNG_VERSANDT", at);
    await service.advanceStage("s2", "RUECKLAUF_ERHALTEN", at);
    const status = await service.productionSubStatus("pa");
    expect(status.allReturned).toBe(true);
  });
});
