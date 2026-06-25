// In-Memory-AuditLog-Repository für Unit-Tests/Dev.

import type {
  RawAuditEntry,
  AuditFilter,
  AuditLogRepository,
} from "../modules/audit-log/audit-query.service.js";

export class InMemoryAuditLogRepository implements AuditLogRepository {
  constructor(private readonly rows: RawAuditEntry[] = []) {}

  async list(filter: AuditFilter): Promise<RawAuditEntry[]> {
    const ql = filter.userEmail?.toLowerCase();
    return this.rows
      .filter((r) => (filter.entity ? r.entity === filter.entity : true))
      .filter((r) => (filter.entityId ? r.entityId === filter.entityId : true))
      .filter((r) => (filter.action ? r.action === filter.action : true))
      .filter((r) => (ql ? (r.userEmail ?? "").toLowerCase().includes(ql) : true))
      .filter((r) => (filter.from ? r.createdAt >= filter.from : true))
      .filter((r) => (filter.to ? r.createdAt <= filter.to : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit ?? 100);
  }

  async distinctEntities(): Promise<string[]> {
    return [...new Set(this.rows.map((r) => r.entity))].sort((a, b) => a.localeCompare(b));
  }
}
