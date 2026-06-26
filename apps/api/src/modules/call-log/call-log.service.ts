// Telefon-Modul / Anrufprotokoll: nachvollziehbar wer wann mit wem worüber telefoniert
// hat. Optional an eine Firma/Kunde verknüpft; Rückrufe lassen sich über den Status
// nachverfolgen (RUECKRUF → ERLEDIGT). Reine Erfassung, keine Telefonanlagen-Integration.

import { buildEntry, type AuditSink } from "@texma/audit";

export type CallDirection = "EINGEHEND" | "AUSGEHEND";
export type CallStatus = "ERLEDIGT" | "OFFEN" | "RUECKRUF";

export interface CreateCallLogInput {
  richtung: CallDirection;
  telefonnummer: string;
  grund: string;
  kontaktName?: string | null;
  companyId?: string | null;
  bearbeiter?: string | null;
  zeitpunkt?: Date | null;
  dauerSek?: number | null;
  ergebnis?: string | null;
  status?: CallStatus | null;
}

export interface CallLogRow {
  id: string;
  richtung: CallDirection;
  telefonnummer: string;
  kontaktName: string | null;
  companyId: string | null;
  companyName: string | null;
  bearbeiter: string | null;
  zeitpunkt: Date;
  dauerSek: number | null;
  grund: string;
  ergebnis: string | null;
  status: CallStatus;
  createdAt: Date;
}

export interface CallLogFilter {
  companyId?: string | null;
  status?: CallStatus | null;
}

/** Bearbeitbare Felder eines Anrufeintrags. */
export interface UpdateCallLogInput {
  richtung?: CallDirection;
  telefonnummer?: string;
  grund?: string;
  kontaktName?: string | null;
  companyId?: string | null;
  zeitpunkt?: Date | null;
  dauerSek?: number | null;
  ergebnis?: string | null;
  status?: CallStatus;
}

export interface CallLogRepository {
  create(input: CreateCallLogInput): Promise<{ id: string }>;
  list(filter?: CallLogFilter): Promise<CallLogRow[]>;
  load(id: string): Promise<CallLogRow | null>;
  update(id: string, patch: UpdateCallLogInput): Promise<void>;
  setStatus(id: string, status: CallStatus): Promise<void>;
  /** Anzahl offener Rückrufe (für ein Badge/Arbeitsliste). */
  openCallbackCount(): Promise<number>;
}

export class CallLogError extends Error {}

export class CallLogService {
  constructor(
    private readonly repo: CallLogRepository,
    private readonly audit: AuditSink
  ) {}

  /** Erfasst einen Anruf. Telefonnummer und Grund sind Pflicht. */
  async create(input: CreateCallLogInput): Promise<{ id: string }> {
    if (!input.telefonnummer || input.telefonnummer.trim().length === 0) {
      throw new CallLogError("Telefonnummer ist Pflicht.");
    }
    if (!input.grund || input.grund.trim().length === 0) {
      throw new CallLogError("Grund/Anliegen ist Pflicht.");
    }
    if (input.dauerSek != null && (!Number.isFinite(input.dauerSek) || input.dauerSek < 0)) {
      throw new CallLogError("Dauer darf nicht negativ sein.");
    }
    const { id } = await this.repo.create({
      ...input,
      telefonnummer: input.telefonnummer.trim(),
      grund: input.grund.trim(),
    });
    await this.audit.append(
      buildEntry({
        entity: "CallLog",
        entityId: id,
        action: "CREATE",
        after: { richtung: input.richtung, telefonnummer: input.telefonnummer.trim(), grund: input.grund.trim() },
      })
    );
    return { id };
  }

  /** Anrufliste (neueste zuerst), optional je Firma/Status gefiltert. */
  async list(filter?: CallLogFilter): Promise<CallLogRow[]> {
    return this.repo.list(filter);
  }

  /** Bearbeitet einen Anrufeintrag (GoBD-auditiert, Vorher/Nachher der geänderten Felder). */
  async update(id: string, patch: UpdateCallLogInput): Promise<void> {
    if (patch.telefonnummer !== undefined && !patch.telefonnummer.trim()) throw new CallLogError("Telefonnummer ist Pflicht.");
    if (patch.grund !== undefined && !patch.grund.trim()) throw new CallLogError("Grund/Anliegen ist Pflicht.");
    if (patch.dauerSek != null && (!Number.isFinite(patch.dauerSek) || patch.dauerSek < 0)) throw new CallLogError("Dauer darf nicht negativ sein.");
    const clean: UpdateCallLogInput = { ...patch };
    if (clean.telefonnummer !== undefined) clean.telefonnummer = clean.telefonnummer.trim();
    if (clean.grund !== undefined) clean.grund = clean.grund.trim();
    const prev = await this.repo.load(id);
    await this.repo.update(id, clean);
    const before: Record<string, unknown> = {};
    if (prev) { const p = prev as unknown as Record<string, unknown>; for (const k of Object.keys(clean)) before[k] = p[k]; }
    await this.audit.append(buildEntry({ entity: "CallLog", entityId: id, action: "UPDATE", before: prev ? before : undefined, after: { ...clean } }));
  }

  /** Setzt den Status (z. B. offenen Rückruf auf ERLEDIGT). */
  async setStatus(id: string, status: CallStatus): Promise<void> {
    await this.repo.setStatus(id, status);
    await this.audit.append(
      buildEntry({ entity: "CallLog", entityId: id, action: "UPDATE", after: { status } })
    );
  }

  /** Anzahl offener Rückrufe (Badge/Arbeitsliste). */
  async openCallbackCount(): Promise<number> {
    return this.repo.openCallbackCount();
  }
}
