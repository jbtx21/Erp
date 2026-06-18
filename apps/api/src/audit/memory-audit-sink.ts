// In-Memory-Audit-Senke für Tests (append-only).
import type { AuditEntry, AuditSink } from "@texma/audit";

export class MemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
