// Büro-Kalender (Terminmanagement): Termine, Urlaub, Abwesenheiten. Persönliche
// (ownerEmail) + geteilte (null) Einträge. Externe Sync (CalDAV/Google) als Port.

import { assertEventRange, type CalendarEventKind } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CalendarEventRow {
  id: string;
  title: string;
  ownerEmail: string | null;
  kind: CalendarEventKind;
  start: Date;
  end: Date;
  allDay: boolean;
  note: string | null;
}

export interface CalendarRepository {
  /** Einträge im Fenster [from,to], sichtbar für ownerEmail (eigene + geteilte). */
  listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]>;
  create(input: Omit<CalendarEventRow, "id">): Promise<{ id: string }>;
  remove(id: string, ownerEmail: string): Promise<boolean>;
}

export class CalendarError extends Error {}

export class CalendarService {
  constructor(private readonly repo: CalendarRepository, private readonly audit: AuditSink) {}

  listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]> {
    return this.repo.listForUser(ownerEmail, from, to);
  }

  async create(input: { title: string; ownerEmail: string; shared: boolean; kind: CalendarEventKind; start: Date; end: Date; allDay: boolean; note?: string | null }): Promise<{ id: string }> {
    if (!input.title.trim()) throw new CalendarError("Titel ist Pflicht.");
    try { assertEventRange(input.start, input.end); }
    catch (e) { throw new CalendarError((e as Error).message); }
    const res = await this.repo.create({
      title: input.title.trim(),
      ownerEmail: input.shared ? null : input.ownerEmail,
      kind: input.kind, start: input.start, end: input.end, allDay: input.allDay, note: input.note ?? null,
    });
    await this.audit.append(buildEntry({ entity: "CalendarEvent", entityId: res.id, action: "CREATE", after: { title: input.title, kind: input.kind } }));
    return res;
  }

  async remove(id: string, ownerEmail: string): Promise<void> {
    const ok = await this.repo.remove(id, ownerEmail);
    if (!ok) throw new CalendarError("Eintrag nicht gefunden oder keine Berechtigung.");
  }
}
