// Audit-Log-Viewer (GoBD, Kap. 10): read-only Abfrage des append-only AuditLog.
// „Wer hat wann was geändert" — mit Filter (Entität/Beleg/Aktion/Nutzer/Zeitraum).
// Rein lesend; das Schreiben bleibt ausschließlich bei den AuditSinks der Services.

/** Roh-Audit-Eintrag aus dem Repository (ohne aufgelöste Belegnummer). */
export interface RawAuditEntry {
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

/** Audit-Eintrag für die UI: zusätzlich mit sprechender Belegnummer (P1.8). */
export interface AuditEntryRow extends RawAuditEntry {
  /** Sprechende Belegnummer des referenzierten Datensatzes (AB-/RE-/KD-…), sonst = entityId. */
  displayId: string;
}

/**
 * Löst interne IDs (cuid) auf sprechende Belegnummern auf, damit das Audit-Protokoll keine
 * rohen cuids zeigt (P1.4/P1.8). Schlüssel = `${entity}:${entityId}`; fehlt ein Mapping,
 * bleibt die entityId stehen.
 */
export interface EntityNumberResolver {
  resolve(refs: ReadonlyArray<{ entity: string; entityId: string }>): Promise<Map<string, string>>;
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
  list(filter: AuditFilter): Promise<RawAuditEntry[]>;
  /** Vorkommende Entitätsnamen (für das Filter-Dropdown). */
  distinctEntities(): Promise<string[]>;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class AuditQueryService {
  constructor(
    private readonly repo: AuditLogRepository,
    private readonly resolver?: EntityNumberResolver
  ) {}

  /** Audit-Einträge (neueste zuerst); Limit auf MAX_LIMIT gedeckelt, mit aufgelöster Belegnummer. */
  async list(filter: AuditFilter = {}): Promise<AuditEntryRow[]> {
    const limit = Math.min(Math.max(1, filter.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const rows = await this.repo.list({ ...filter, limit });
    const map = this.resolver
      ? await this.resolver.resolve(rows.map((r) => ({ entity: r.entity, entityId: r.entityId })))
      : new Map<string, string>();
    return rows.map((r) => ({ ...r, displayId: map.get(`${r.entity}:${r.entityId}`) ?? r.entityId }));
  }

  /** Bekannte Entitätsnamen für die Filterauswahl. */
  entities(): Promise<string[]> {
    return this.repo.distinctEntities();
  }
}
