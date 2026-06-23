// Prisma-Kalender: eigene + geteilte Einträge im Zeitfenster.

import { prisma } from "@texma/db";
import type { CalendarEventKind } from "@texma/shared";
import type { CalendarEventRow, CalendarRepository } from "../modules/calendar/calendar.service.js";

export class PrismaCalendarRepository implements CalendarRepository {
  async listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]> {
    const rows = await prisma.calendarEvent.findMany({
      where: { AND: [{ OR: [{ ownerEmail }, { ownerEmail: null }] }, { start: { lte: to } }, { end: { gte: from } }] },
      orderBy: { start: "asc" },
    });
    return rows.map((e) => ({ id: e.id, title: e.title, ownerEmail: e.ownerEmail, kind: e.kind as CalendarEventKind, start: e.start, end: e.end, allDay: e.allDay, note: e.note }));
  }
  async create(input: Omit<CalendarEventRow, "id">): Promise<{ id: string }> {
    return prisma.calendarEvent.create({
      data: { title: input.title, ownerEmail: input.ownerEmail, kind: input.kind as never, start: input.start, end: input.end, allDay: input.allDay, note: input.note },
      select: { id: true },
    });
  }
  async remove(id: string, ownerEmail: string): Promise<boolean> {
    const res = await prisma.calendarEvent.deleteMany({ where: { id, OR: [{ ownerEmail }, { ownerEmail: null }] } });
    return res.count > 0;
  }
}
