// In-Memory-Kalender für Tests.

import { overlapsWindow } from "@texma/shared";
import type { CalendarEventRow, CalendarRepository } from "../modules/calendar/calendar.service.js";

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
  async remove(id: string, ownerEmail: string): Promise<boolean> {
    const e = this.items.find((x) => x.id === id);
    if (!e || (e.ownerEmail !== null && e.ownerEmail !== ownerEmail)) return false;
    this.items = this.items.filter((x) => x.id !== id);
    return true;
  }
}
