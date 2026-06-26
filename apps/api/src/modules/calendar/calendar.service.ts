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
  /** Quell-Verknüpfung (z. B. Aufgabe): sourceEntity="task", sourceId=Task.id; sonst null. */
  sourceEntity: string | null;
  sourceId: string | null;
}

/** Daten eines quellen-gebundenen Termins (z. B. aus einer Aufgabe abgeleitet). */
export interface SourceEventData {
  title: string;
  ownerEmail: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
}

/** Bearbeitbare Felder eines Kalendereintrags. */
export interface UpdateCalendarInput {
  title?: string;
  kind?: CalendarEventKind;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  note?: string | null;
}

export interface CalendarRepository {
  /** Einträge im Fenster [from,to], sichtbar für ownerEmail (eigene + geteilte). */
  listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]>;
  create(input: Omit<CalendarEventRow, "id">): Promise<{ id: string }>;
  loadById(id: string): Promise<CalendarEventRow | null>;
  update(id: string, ownerEmail: string, patch: UpdateCalendarInput): Promise<boolean>;
  remove(id: string, ownerEmail: string): Promise<boolean>;
  /** Idempotenter Upsert über (sourceEntity, sourceId): legt an oder aktualisiert. */
  upsertForSource(sourceEntity: string, sourceId: string, data: SourceEventData): Promise<void>;
  /** Entfernt den quellen-gebundenen Termin (falls vorhanden). */
  removeBySource(sourceEntity: string, sourceId: string): Promise<void>;
}

export class CalendarError extends Error {}

export class CalendarService {
  constructor(private readonly repo: CalendarRepository, private readonly audit: AuditSink) {}

  listForUser(ownerEmail: string, from: Date, to: Date): Promise<CalendarEventRow[]> {
    return this.repo.listForUser(ownerEmail, from, to);
  }

  /** Einzelnen Termin laden (z. B. um eine Aufgaben-Verknüpfung zu prüfen). */
  loadById(id: string): Promise<CalendarEventRow | null> {
    return this.repo.loadById(id);
  }

  async create(input: { title: string; ownerEmail: string; shared: boolean; kind: CalendarEventKind; start: Date; end: Date; allDay: boolean; note?: string | null }): Promise<{ id: string }> {
    if (!input.title.trim()) throw new CalendarError("Titel ist Pflicht.");
    try { assertEventRange(input.start, input.end); }
    catch (e) { throw new CalendarError((e as Error).message); }
    const res = await this.repo.create({
      title: input.title.trim(),
      ownerEmail: input.shared ? null : input.ownerEmail,
      kind: input.kind, start: input.start, end: input.end, allDay: input.allDay, note: input.note ?? null,
      sourceEntity: null, sourceId: null,
    });
    await this.audit.append(buildEntry({ entity: "CalendarEvent", entityId: res.id, action: "CREATE", after: { title: input.title, kind: input.kind } }));
    return res;
  }

  /** Bearbeitet einen Termin (nur eigene/geteilte); validiert den Zeitraum. GoBD-auditiert. */
  async update(id: string, ownerEmail: string, patch: UpdateCalendarInput): Promise<void> {
    if (patch.title !== undefined && !patch.title.trim()) throw new CalendarError("Titel ist Pflicht.");
    // Zeitraum nur gemeinsam ändern — sonst ließe sich der Gegenwert nicht prüfen und end<start
    // über die API durchschmuggeln (ohne den anderen Wert nachzuladen).
    if ((patch.start === undefined) !== (patch.end === undefined)) {
      throw new CalendarError("Beginn und Ende müssen gemeinsam geändert werden.");
    }
    if (patch.start && patch.end) {
      try { assertEventRange(patch.start, patch.end); }
      catch (e) { throw new CalendarError((e as Error).message); }
    }
    const clean: UpdateCalendarInput = { ...patch };
    if (clean.title !== undefined) clean.title = clean.title.trim();
    const prev = await this.repo.loadById(id);
    const ok = await this.repo.update(id, ownerEmail, clean);
    if (!ok) throw new CalendarError("Eintrag nicht gefunden oder keine Berechtigung.");
    const before: Record<string, unknown> = {};
    if (prev) { const p = prev as unknown as Record<string, unknown>; for (const k of Object.keys(clean)) before[k] = p[k]; }
    await this.audit.append(buildEntry({ entity: "CalendarEvent", entityId: id, action: "UPDATE", before: prev ? before : undefined, after: { ...clean } }));
  }

  async remove(id: string, ownerEmail: string): Promise<void> {
    const ok = await this.repo.remove(id, ownerEmail);
    if (!ok) throw new CalendarError("Eintrag nicht gefunden oder keine Berechtigung.");
  }

  /** Synchronisiert einen quellen-gebundenen Termin (z. B. aus einer Aufgabe): `data`
   *  vorhanden → anlegen/aktualisieren (Art AUFGABE); `null` → entfernen. Idempotent. */
  async syncSource(sourceEntity: string, sourceId: string, data: SourceEventData | null): Promise<void> {
    if (data) {
      if (!data.title.trim()) throw new CalendarError("Titel ist Pflicht.");
      await this.repo.upsertForSource(sourceEntity, sourceId, { ...data, title: data.title.trim() });
    } else {
      await this.repo.removeBySource(sourceEntity, sourceId);
    }
  }
}
