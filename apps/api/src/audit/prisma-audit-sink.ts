// Prisma-Audit-Senke (GoBD, Kap. 10) — schreibt append-only in AuditLog.
import type { AuditEntry, AuditSink } from "@texma/audit";
import { prisma } from "@texma/db";

export class PrismaAuditSink implements AuditSink {
  async append(entry: AuditEntry): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: (entry.before as object | undefined) ?? undefined,
        after: (entry.after as object | undefined) ?? undefined,
        createdAt: entry.createdAt,
      },
    });
  }
}
