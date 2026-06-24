// In-Memory-Anrufprotokoll für Unit-Tests/Dev.

import type {
  CallLogFilter,
  CallLogRepository,
  CallLogRow,
  CallStatus,
  CreateCallLogInput,
} from "../modules/call-log/call-log.service.js";

interface Stored extends Omit<CallLogRow, "companyName"> {}

export class InMemoryCallLogRepository implements CallLogRepository {
  private readonly calls = new Map<string, Stored>();
  private seq = 0;
  /** Firmen-IDs → Name, für die Anzeige (optional vorab gesetzt). */
  constructor(private readonly companyNames: Record<string, string> = {}) {}

  get(id: string): Stored | undefined {
    return this.calls.get(id);
  }

  async create(input: CreateCallLogInput): Promise<{ id: string }> {
    const id = `call_${++this.seq}`;
    this.calls.set(id, {
      id,
      richtung: input.richtung,
      telefonnummer: input.telefonnummer,
      kontaktName: input.kontaktName ?? null,
      companyId: input.companyId ?? null,
      bearbeiter: input.bearbeiter ?? null,
      zeitpunkt: input.zeitpunkt ?? new Date(),
      dauerSek: input.dauerSek ?? null,
      grund: input.grund,
      ergebnis: input.ergebnis ?? null,
      status: input.status ?? "ERLEDIGT",
      createdAt: new Date(),
    });
    return { id };
  }

  async list(filter?: CallLogFilter): Promise<CallLogRow[]> {
    return [...this.calls.values()]
      .filter((c) => (filter?.companyId ? c.companyId === filter.companyId : true))
      .filter((c) => (filter?.status ? c.status === filter.status : true))
      .sort((a, b) => b.zeitpunkt.getTime() - a.zeitpunkt.getTime())
      .map((c) => ({ ...c, companyName: c.companyId ? (this.companyNames[c.companyId] ?? null) : null }));
  }

  async setStatus(id: string, status: CallStatus): Promise<void> {
    const c = this.calls.get(id);
    if (c) c.status = status;
  }

  async openCallbackCount(): Promise<number> {
    return [...this.calls.values()].filter((c) => c.status === "RUECKRUF").length;
  }
}
