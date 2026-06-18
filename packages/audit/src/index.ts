// GoBD Audit-Trail + WORM/Retention-Primitive — Kap. 10.
// Grundsatz: finalisierte Belege sind unveränderbar. Korrektur nur über eine
// neue Version (Storno/Gutschrift), niemals In-place-Update.

export type AuditAction = "CREATE" | "UPDATE" | "FINALIZE" | "STORNO";

export interface AuditEntry {
  userId?: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  createdAt: Date;
}

/** Append-only-Senke (z. B. Prisma AuditLog.create). Keine Update/Delete-Methode. */
export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
}

export function buildEntry(
  input: Omit<AuditEntry, "createdAt">
): AuditEntry {
  return { ...input, createdAt: new Date() };
}

export class ImmutableViolationError extends Error {
  constructor(entity: string, entityId: string) {
    super(
      `GoBD-Verstoß: finalisierter Beleg ${entity}/${entityId} darf nicht verändert werden (Kap. 10.1). Storno/Gutschrift verwenden.`
    );
    this.name = "ImmutableViolationError";
  }
}

/**
 * Aufbewahrungsfristen (Kap. 10.1):
 *  - 10 Jahre: Rechnungen/Buchungsbelege
 *  - 6 Jahre: Geschäftsbriefe/Angebote/Auftragsbestätigungen
 */
export type RetentionClass = "BOOKING_10Y" | "BUSINESS_6Y";

export function retentionYears(cls: RetentionClass): number {
  return cls === "BOOKING_10Y" ? 10 : 6;
}

/** Frühestes Löschdatum; steuerrelevant → sperren statt löschen (Kap. 28). */
export function earliestDeletionDate(createdAt: Date, cls: RetentionClass): Date {
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + retentionYears(cls));
  return d;
}

/** Wirft, wenn ein finalisierter (WORM) Beleg mutiert werden soll. */
export function assertMutable(
  finalized: boolean,
  entity: string,
  entityId: string
): void {
  if (finalized) throw new ImmutableViolationError(entity, entityId);
}
