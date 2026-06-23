import { describe, expect, it } from "vitest";
import { HrError, HrService } from "./hr.service.js";
import { InMemoryHrRepository } from "../../repositories/in-memory-hr.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
function setup() { const repo = new InMemoryHrRepository(); return { svc: new HrService(repo, new MemAudit()), repo }; }

describe("HrService (Personalwesen)", () => {
  it("legt Mitarbeiter an mit Resturlaub = Jahresanspruch", async () => {
    const { svc } = setup();
    await svc.addEmployee({ name: "Anna Klein", email: "anna@texma.de", position: "Vertrieb", urlaubstageJahr: 30 });
    const list = await svc.listEmployees();
    expect(list[0]?.resturlaub).toBe(30);
  });

  it("Urlaubsantrag zählt Werktage; Genehmigung mindert Resturlaub + erzeugt Kalendereintrag", async () => {
    const { svc, repo } = setup();
    const emp = await svc.addEmployee({ name: "Bert", email: "bert@texma.de" });
    const req = await svc.requestVacation({ employeeId: emp.id, vonDatum: new Date("2026-07-06"), bisDatum: new Date("2026-07-10") }); // Mo-Fr = 5
    expect(req.tage).toBe(5);
    await svc.decideVacation(req.id, true);
    expect((await svc.listEmployees())[0]?.resturlaub).toBe(25);
    expect(repo.calendarAbsences).toHaveLength(1);
    expect(repo.calendarAbsences[0]?.title).toContain("Bert");
  });

  it("Ablehnung erzeugt keinen Kalendereintrag; doppelte Entscheidung verboten", async () => {
    const { svc, repo } = setup();
    const emp = await svc.addEmployee({ name: "C", email: "c@texma.de" });
    const req = await svc.requestVacation({ employeeId: emp.id, vonDatum: new Date("2026-07-06"), bisDatum: new Date("2026-07-08") });
    await svc.decideVacation(req.id, false);
    expect(repo.calendarAbsences).toHaveLength(0);
    await expect(svc.decideVacation(req.id, true)).rejects.toBeInstanceOf(HrError);
  });

  it("validiert Eingaben", async () => {
    const { svc } = setup();
    await expect(svc.addEmployee({ name: "", email: "x@y.de" })).rejects.toBeInstanceOf(HrError);
    await expect(svc.addEmployee({ name: "X", email: "keine-mail" })).rejects.toBeInstanceOf(HrError);
    const emp = await svc.addEmployee({ name: "D", email: "d@texma.de" });
    await expect(svc.requestVacation({ employeeId: emp.id, vonDatum: new Date("2026-07-11"), bisDatum: new Date("2026-07-12") })).rejects.toBeInstanceOf(HrError); // Sa/So
  });
});
