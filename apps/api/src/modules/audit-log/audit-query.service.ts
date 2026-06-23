// Audit-Log-Viewer (GoBD, Kap. 10): read-only Abfrage des append-only AuditLog.
// „Wer hat wann was geändert" — mit Filter (Entität/Beleg/Aktion/Nutzer/Zeitraum).
// Rein lesend; das Schreiben bleibt ausschließlich bei den AuditSinks der Services.

export interface AuditEntryRow {
  id: string;
  createdAt: Date;
  userEmail: string | null;
  userName: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
}

export interface AuditFilter {
  entity?: string;
  entityId?: string;
  action?: string;
  /** Filter über die E-Mail des handelnden Nutzers (Teilstring). */
  userEmail?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface AuditLogRepository {
  list(filter: AuditFilter): Promise<AuditEntryRow[]>;
  /** Vorkommende Entitätsnamen (für das Filter-Dropdown). */
  distinctEntities(): Promise<string[]>;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class AuditQueryService {
  constructor(private readonly repo: AuditLogRepository) {}

  /** Audit-Einträge (neueste zuerst); Limit auf MAX_LIMIT gedeckelt. */
  async list(filter: AuditFilter = {}): Promise<AuditEntryRow[]> {
    const limit = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    return this.repo.list({ ...filter, limit });
  }

  /** Bekannte Entitätsnamen für die Filterauswahl. */
  entities(): Promise<string[]> {
    return this.repo.distinctEntities();
  }
}
