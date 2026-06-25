// Prisma-AuditLog-Repository (read-only) für den Audit-Log-Viewer (GoBD, Kap. 10).

import { prisma } from "@texma/db";
import type {
  RawAuditEntry,
  AuditFilter,
  AuditLogRepository,
} from "../modules/audit-log/audit-query.service.js";

export class PrismaAuditLogRepository implements AuditLogRepository {
  async list(filter: AuditFilter): Promise<RawAuditEntry[]> {
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(filter.entity ? { entity: filter.entity } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.userEmail ? { user: { email: { contains: filter.userEmail, mode: "insensitive" } } } : {}),
        ...(filter.from || filter.to
          ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
      select: {
        id: true, createdAt: true, entity: true, entityId: true, action: true, before: true, after: true,
        user: { select: { email: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      userEmail: r.user?.email ?? null,
      userName: r.user?.name ?? null,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      before: r.before ?? null,
      after: r.after ?? null,
    }));
  }

  async distinctEntities(): Promise<string[]> {
    const rows = await prisma.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } });
    return rows.map((r) => r.entity);
  }
}
