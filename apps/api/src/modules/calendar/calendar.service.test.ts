import { describe, expect, it } from "vitest";
import { CalendarError, CalendarService } from "./calendar.service.js";
import { InMemoryCalendarRepository } from "../../repositories/in-memory-calendar.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
const svc = () => { const repo = new InMemoryCalendarRepository(); return { svc: new CalendarService(repo, new MemAudit()), repo }; };

describe("CalendarService (Büro-Kalender)", () => {
  it("legt persönliche + geteilte Termine an; Nutzer sieht eigene + geteilte, nicht fremde", async () => {
    const { svc: s } = svc();
    await s.create({ title: "Kundentermin", ownerEmail: "anna@texma.de", shared: false, kind: "TERMIN", start: new Date("2026-06-15T09:00Z"), end: new Date("2026-06-15T10:00Z"), allDay: false });
    await s.create({ title: "Betriebsausflug", ownerEmail: "anna@texma.de", shared: true, kind: "SONSTIGES", start: new Date("2026-06-16"), end: new Date("2026-06-16"), allDay: true });
    await s.create({ title: "Bert Urlaub", ownerEmail: "bert@texma.de", shared: false, kind: "URLAUB", start: new Date("2026-06-15"), end: new Date("2026-06-20"), allDay: true });
    const list = await s.listForUser("anna@texma.de", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(list.map((e) => e.title)).toEqual(["Kundentermin", "Betriebsausflug"]);
  });

  it("lehnt Ende vor Beginn ab", async () => {
    const { svc: s } = svc();
    await expect(s.create({ title: "X", ownerEmail: "a@b.de", shared: false, kind: "TERMIN", start: new Date("2026-06-15"), end: new Date("2026-06-14"), allDay: false })).rejects.toBeInstanceOf(CalendarError);
  });

  it("entfernt nur eigene/geteilte Einträge", async () => {
    const { svc: s, repo } = svc();
    const { id } = await s.create({ title: "X", ownerEmail: "anna@texma.de", shared: false, kind: "TERMIN", start: new Date("2026-06-15"), end: new Date("2026-06-15"), allDay: true });
    await expect(s.remove(id, "bert@texma.de")).rejects.toBeInstanceOf(CalendarError);
    await s.remove(id, "anna@texma.de");
    expect(repo.items).toHaveLength(0);
  });
});
