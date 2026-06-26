// In-Memory-Kalender für Tests.

import { overlapsWindow } from "@texma/shared";
import type { CalendarEventRow, CalendarRepository, SourceEventData, UpdateCalendarInput } from "../modules/calendar/calendar.service.js";

export class InMemoryCalendarRepository implements CalendarRepository {
  public items: CalendarEventRow[] = [];
  private seq = 0;
  async listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]> {
    return this.items
      .filter((e) => (e.ownerEmail === ownerEmail || e.ownerEmail === null) && overlapsWindow(e.start, e.end, from, to))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  async create(input: Omit<CalendarEventRow, "id">): Promise<{ id: string }> {
    const id = `cal_${String(++this.seq)}`;
    this.items.push({ id, ...input });
    return { id };
  }
  async loadById(id: string): Promise<CalendarEventRow | null> {
    const e = this.items.find((x) => x.id === id);
    return e ? { ...e } : null;
  }
  async update(id: string, ownerEmail: string, patch: UpdateCalendarInput): Promise<boolean> {
    const e = this.items.find((x) => x.id === id);
    if (!e || (e.ownerEmail !== null && e.ownerEmail !== ownerEmail)) return false;
    if (patch.title !== undefined) e.title = patch.title;
    if (patch.kind !== undefined) e.kind = patch.kind;
    if (patch.start !== undefined) e.start = patch.start;
    if (patch.end !== undefined) e.end = patch.end;
    if (patch.allDay !== undefined) e.allDay = patch.allDay;
    if (patch.note !== undefined) e.note = patch.note;
    return true;
  }
  async remove(id: string, ownerEmail: string): Promise<boolean> {
    const e = this.items.find((x) => x.id === id);
    if (!e || (e.ownerEmail !== null && e.ownerEmail !== ownerEmail)) return false;
    this.items = this.items.filter((x) => x.id !== id);
    return true;
  }
  async upsertForSource(sourceEntity: string, sourceId: string, data: SourceEventData): Promise<void> {
    const e = this.items.find((x) => x.sourceEntity === sourceEntity && x.sourceId === sourceId);
    if (e) { e.title = data.title; e.ownerEmail = data.ownerEmail; e.start = data.start; e.end = data.end; e.allDay = data.allDay; }
    else this.items.push({ id: `cal_${String(++this.seq)}`, kind: "AUFGABE", note: null, sourceEntity, sourceId, ...data });
  }
  async removeBySource(sourceEntity: string, sourceId: string): Promise<void> {
    this.items = this.items.filter((x) => !(x.sourceEntity === sourceEntity && x.sourceId === sourceId));
  }
}
