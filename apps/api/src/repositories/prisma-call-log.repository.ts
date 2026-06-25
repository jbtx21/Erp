// Prisma-Implementierung des Anrufprotokolls (Telefon-Modul).

import { prisma } from "@texma/db";
import type {
  CallDirection,
  CallLogFilter,
  CallLogRepository,
  CallLogRow,
  CallStatus,
  CreateCallLogInput,
  UpdateCallLogInput,
} from "../modules/call-log/call-log.service.js";

export class PrismaCallLogRepository implements CallLogRepository {
  async create(input: CreateCallLogInput): Promise<{ id: string }> {
    return prisma.callLog.create({
      data: {
        richtung: input.richtung,
        telefonnummer: input.telefonnummer,
        grund: input.grund,
        kontaktName: input.kontaktName ?? null,
        companyId: input.companyId ?? null,
        bearbeiter: input.bearbeiter ?? null,
        zeitpunkt: input.zeitpunkt ?? undefined,
        dauerSek: input.dauerSek ?? null,
        ergebnis: input.ergebnis ?? null,
        status: input.status ?? undefined,
      },
      select: { id: true },
    });
  }

  async list(filter?: CallLogFilter): Promise<CallLogRow[]> {
    const rows = await prisma.callLog.findMany({
      where: {
        companyId: filter?.companyId ?? undefined,
        status: filter?.status ?? undefined,
      },
      orderBy: { zeitpunkt: "desc" },
      include: { company: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      richtung: r.richtung as CallDirection,
      telefonnummer: r.telefonnummer,
      kontaktName: r.kontaktName,
      companyId: r.companyId,
      companyName: r.company?.name ?? null,
      bearbeiter: r.bearbeiter,
      zeitpunkt: r.zeitpunkt,
      dauerSek: r.dauerSek,
      grund: r.grund,
      ergebnis: r.ergebnis,
      status: r.status as CallStatus,
      createdAt: r.createdAt,
    }));
  }

  async update(id: string, patch: UpdateCallLogInput): Promise<void> {
    await prisma.callLog.update({
      where: { id },
      data: {
        ...(patch.richtung !== undefined ? { richtung: patch.richtung } : {}),
        ...(patch.telefonnummer !== undefined ? { telefonnummer: patch.telefonnummer } : {}),
        ...(patch.grund !== undefined ? { grund: patch.grund } : {}),
        ...(patch.kontaktName !== undefined ? { kontaktName: patch.kontaktName } : {}),
        ...(patch.companyId !== undefined ? { companyId: patch.companyId } : {}),
        ...(patch.zeitpunkt !== undefined && patch.zeitpunkt !== null ? { zeitpunkt: patch.zeitpunkt } : {}),
        ...(patch.dauerSek !== undefined ? { dauerSek: patch.dauerSek } : {}),
        ...(patch.ergebnis !== undefined ? { ergebnis: patch.ergebnis } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
    });
  }

  async setStatus(id: string, status: CallStatus): Promise<void> {
    await prisma.callLog.update({ where: { id }, data: { status } });
  }

  async openCallbackCount(): Promise<number> {
    return prisma.callLog.count({ where: { status: "RUECKRUF" } });
  }
}
