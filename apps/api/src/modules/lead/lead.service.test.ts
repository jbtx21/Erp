// Unit-Test des Lead-Funnels (B15) mit In-Memory-Repo — ohne DB. Deckt Funnel,
// Konvertierung und das QUALIFIZIERT-Gate ab (mirrort den Prisma-Pfad).

import { describe, expect, it } from "vitest";
import { LeadError } from "@texma/shared";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryLeadRepository } from "../../repositories/in-memory-lead.repository.js";
import { LeadService } from "./lead.service.js";

function setup() {
  const repo = new InMemoryLeadRepository();
  return { repo, service: new LeadService(repo, new MemoryAuditSink()) };
}

describe("LeadService (B15)", () => {
  it("Funnel NEU → QUALIFIZIERT → konvertiert zu Company", async () => {
    const { repo, service } = setup();
    const lead = await service.create({ name: "Acme", quelle: "WEB", email: "a@b.de" });
    await service.transition(lead.id, "KONTAKTIERT");
    await service.transition(lead.id, "QUALIFIZIERT");

    const { companyId } = await service.convert(lead.id);
    expect(repo.get(lead.id)).toMatchObject({ status: "KONVERTIERT", convertedCompanyId: companyId });
  });

  it("übernimmt B2B-Felder (Firma/Verantwortlicher) beim Anlegen", async () => {
    const { repo, service } = setup();
    const { id } = await service.create({
      name: "Max Mustermann", quelle: "TELEFON", firma: "Interessent GmbH", verantwortlicher: "vertrieb@texma-gmbh.de",
    });
    expect(repo.get(id)).toMatchObject({ firma: "Interessent GmbH", verantwortlicher: "vertrieb@texma-gmbh.de", name: "Max Mustermann" });
    const [row] = await service.list();
    expect(row).toMatchObject({ firma: "Interessent GmbH", webseite: null });
  });

  it("ein nicht qualifizierter Lead ist nicht konvertierbar", async () => {
    const { service } = setup();
    const lead = await service.create({ name: "Acme", quelle: "WEB" });
    await expect(service.convert(lead.id)).rejects.toBeTruthy();
  });

  it("verbietet ungültige Übergänge (F2)", async () => {
    const { service } = setup();
    const lead = await service.create({ name: "Acme", quelle: "WEB" });
    await expect(service.transition(lead.id, "KONVERTIERT")).rejects.toBeTruthy();
  });

  it("Verwerfen verlangt einen Grund", async () => {
    const { repo, service } = setup();
    const lead = await service.create({ name: "Acme", quelle: "WEB" });
    await expect(service.discard(lead.id, "  ")).rejects.toBeInstanceOf(LeadError);
    await service.discard(lead.id, "kein Bedarf");
    expect(repo.get(lead.id)?.status).toBe("VERWORFEN");
  });

  it("leerer Name wird abgelehnt", async () => {
    const { service } = setup();
    await expect(service.create({ name: "  ", quelle: "WEB" })).rejects.toBeInstanceOf(LeadError);
  });
});
