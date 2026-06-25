// Prisma-Audit-Senke (GoBD, Kap. 10) — schreibt append-only in AuditLog.
import { Prisma } from "@texma/db";
import type { AuditEntry, AuditSink } from "@texma/audit";
import { prisma } from "@texma/db";
import { currentAuditUserId } from "./audit-context.js";

export class PrismaAuditSink implements AuditSink {
  async append(entry: AuditEntry): Promise<void> {
    const userId = entry.userId ?? currentAuditUserId();
    const data = {
      // GoBD „Wer": expliziter Eintrag, sonst der handelnde Request-Nutzer (ALS).
      userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: (entry.before as object | undefined) ?? undefined,
      after: (entry.after as object | undefined) ?? undefined,
      createdAt: entry.createdAt,
    };
    try {
      await prisma.auditLog.create({ data });
    } catch (e) {
      // Härtung: Der Audit-Eintrag darf die Geschäftsmutation NIE abbrechen. Zeigt der
      // handelnde Nutzer auf keinen existierenden User (FK P2003 — z. B. fehlgeseedeter
      // Demo-Nutzer), wird der Eintrag OHNE Akteur-Referenz nachgezogen statt verworfen
      // (der Trail bleibt erhalten, nur das „Wer" ist unauflösbar). Andere Fehler werfen.
      if (userId != null && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        // eslint-disable-next-line no-console
        console.warn(`[audit] Acting-User "${userId}" nicht in User-Tabelle — Eintrag ohne Akteur (${entry.entity}/${entry.action}).`);
        await prisma.auditLog.create({ data: { ...data, userId: null } });
        return;
      }
      throw e;
    }
  }
}
