import { describe, expect, it } from "vitest";
import { CrmService } from "./crm.service.js";
import { InMemoryCrmRepository } from "../../repositories/in-memory-crm.repository.js";
import { CrmError } from "@texma/shared";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
let n = 0;
const numbering = { next: async () => `AN-2026-${String(++n).padStart(4, "0")}` } as unknown as import("../numbering/numbering.service.js").NumberingService;

function setup() {
  n = 0;
  const repo = new InMemoryCrmRepository();
  const audit = new MemAudit();
  return { svc: new CrmService(repo, numbering, audit), repo, audit };
}

describe("CrmService (vereinheitlichter Funnel)", () => {
  it("legt einen CRM-Eintrag in Stufe NEU an und auditiert", async () => {
    const { svc, audit } = setup();
    const rec = await svc.create({ name: "Müller GmbH Anfrage" });
    expect(rec.stage).toBe("NEU");
    expect(audit.entries).toHaveLength(1);
  });

  it("verlangt einen Namen", async () => {
    const { svc } = setup();
    await expect(svc.create({ name: "  " })).rejects.toBeInstanceOf(CrmError);
  });

  it("führt den Funnel F2-geprüft weiter", async () => {
    const { svc } = setup();
    const rec = await svc.create({ name: "Lead A" });
    await svc.advance(rec.id, "KONTAKTIERT");
    await svc.advance(rec.id, "QUALIFIZIERT");
    const list = await svc.list();
    expect(list[0]?.stage).toBe("QUALIFIZIERT");
  });

  it("verbietet illegale Sprünge", async () => {
    const { svc } = setup();
    const rec = await svc.create({ name: "Lead B" });
    await expect(svc.advance(rec.id, "GEWONNEN")).rejects.toBeTruthy();
  });

  it("verlangt einen Verlust-Grund", async () => {
    const { svc } = setup();
    const rec = await svc.create({ name: "Lead C" });
    await expect(svc.advance(rec.id, "VERLOREN")).rejects.toBeInstanceOf(CrmError);
    await svc.advance(rec.id, "VERLOREN", "Budget gestrichen");
    const list = await svc.list();
    expect(list[0]?.stage).toBe("VERLOREN");
    expect(list[0]?.lostReason).toBe("Budget gestrichen");
  });

  it("überführt einen offenen Eintrag mit Firma in ein Angebot (eigener Nummernkreis)", async () => {
    const { svc } = setup();
    const rec = await svc.create({ name: "Chance", companyId: "c1", text: "100 Polos Siebdruck" });
    await svc.advance(rec.id, "QUALIFIZIERT");
    const res = await svc.convertToQuote(rec.id);
    expect(res.number).toBe("AN-2026-0001");
    const list = await svc.list();
    expect(list[0]?.stage).toBe("ANGEBOT");
    expect(list[0]?.quoteId).toBe(res.quoteId);
  });

  it("verweigert die Überführung ohne Firma", async () => {
    const { svc } = setup();
    const rec = await svc.create({ name: "Chance ohne Firma" });
    await expect(svc.convertToQuote(rec.id)).rejects.toBeInstanceOf(CrmError);
  });

  it("verweigert die Überführung aus ANGEBOT/Endzustand", async () => {
    const { svc } = setup();
    const rec = await svc.create({ name: "Chance", companyId: "c1" });
    await svc.advance(rec.id, "QUALIFIZIERT");
    await svc.convertToQuote(rec.id); // → ANGEBOT
    await expect(svc.convertToQuote(rec.id)).rejects.toBeInstanceOf(CrmError);
  });
});
