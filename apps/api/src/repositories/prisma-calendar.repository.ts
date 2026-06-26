// Prisma-Kalender: eigene + geteilte Einträge im Zeitfenster.

import { prisma } from "@texma/db";
import type { CalendarEventKind } from "@texma/shared";
import type { CalendarEventRow, CalendarRepository, SourceEventData, UpdateCalendarInput } from "../modules/calendar/calendar.service.js";

const toRow = (e: { id: string; title: string; ownerEmail: string | null; kind: string; start: Date; end: Date; allDay: boolean; note: string | null; sourceEntity: string | null; sourceId: string | null }): CalendarEventRow =>
  ({ id: e.id, title: e.title, ownerEmail: e.ownerEmail, kind: e.kind as CalendarEventKind, start: e.start, end: e.end, allDay: e.allDay, note: e.note, sourceEntity: e.sourceEntity, sourceId: e.sourceId });

export class PrismaCalendarRepository implements CalendarRepository {
  async listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]> {
    const rows = await prisma.calendarEvent.findMany({
      where: { AND: [{ OR: [{ ownerEmail }, { ownerEmail: null }] }, { start: { lte: to } }, { end: { gte: from } }] },
      orderBy: { start: "asc" },
    });
    return rows.map(toRow);
  }
  async create(input: Omit<CalendarEventRow, "id">): Promise<{ id: string }> {
    return prisma.calendarEvent.create({
      data: { title: input.title, ownerEmail: input.ownerEmail, kind: input.kind as never, start: input.start, end: input.end, allDay: input.allDay, note: input.note, sourceEntity: input.sourceEntity, sourceId: input.sourceId },
      select: { id: true },
    });
  }
  async loadById(id: string): Promise<CalendarEventRow | null> {
    const e = await prisma.calendarEvent.findUnique({ where: { id } });
    return e ? toRow(e) : null;
  }
  async update(id: string, ownerEmail: string, patch: UpdateCalendarInput): Promise<boolean> {
    const res = await prisma.calendarEvent.updateMany({
      where: { id, OR: [{ ownerEmail }, { ownerEmail: null }] },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind as never } : {}),
        ...(patch.start !== undefined ? { start: patch.start } : {}),
        ...(patch.end !== undefined ? { end: patch.end } : {}),
        ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
    });
    return res.count > 0;
  }
  async remove(id: string, ownerEmail: string): Promise<boolean> {
    const res = await prisma.calendarEvent.deleteMany({ where: { id, OR: [{ ownerEmail }, { ownerEmail: null }] } });
    return res.count > 0;
  }
  async upsertForSource(sourceEntity: string, sourceId: string, data: SourceEventData): Promise<void> {
    await prisma.calendarEvent.upsert({
      where: { sourceEntity_sourceId: { sourceEntity, sourceId } },
      create: { title: data.title, ownerEmail: data.ownerEmail, kind: "AUFGABE", start: data.start, end: data.end, allDay: data.allDay, sourceEntity, sourceId },
      update: { title: data.title, ownerEmail: data.ownerEmail, kind: "AUFGABE", start: data.start, end: data.end, allDay: data.allDay },
    });
  }
  async removeBySource(sourceEntity: string, sourceId: string): Promise<void> {
    await prisma.calendarEvent.deleteMany({ where: { sourceEntity, sourceId } });
  }
}
