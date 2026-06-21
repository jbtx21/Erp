// Prisma-Implementierung des Produktions-Reporting-Repositories (Kap. 29/35).
// Durchlaufzeit: versendete Aufträge, Fertigstellung = frühester Lieferschein,
// Start = Auftragsanlage. Fehlerquote: je Auftrag, reklamiert = mind. ein Complaint
// (Ursache der ältesten Reklamation). Read-only, keine Geld-/Kundenfelder.

import { prisma } from "@texma/db";
import {
  isOnTime,
  leadTimeHours,
  type DefectCause,
  type DefectPoint,
  type LeadTimePoint,
  type OnTimePoint,
} from "@texma/shared";
import type { ProductionReportingRepository } from "../modules/production-reporting/production-reporting.service.js";

export class PrismaProductionReportingRepository implements ProductionReportingRepository {
  async leadTimePoints(): Promise<LeadTimePoint[]> {
    // Nur versendete Aufträge mit Lieferschein gelten als fertiggestellt.
    const orders = await prisma.order.findMany({
      where: { status: "VERSENDET", deliveryNotes: { some: {} } },
      select: {
        createdAt: true,
        deliveryNotes: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    return orders.flatMap((o) => {
      const done = o.deliveryNotes[0]?.createdAt;
      return done ? [{ at: done, hours: leadTimeHours(o.createdAt, done) }] : [];
    });
  }

  async defectPoints(): Promise<DefectPoint[]> {
    const orders = await prisma.order.findMany({
      select: {
        createdAt: true,
        complaints: { select: { cause: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    return orders.map((o) => {
      const cause = o.complaints[0]?.cause as DefectCause | undefined;
      return { at: o.createdAt, defective: cause !== undefined, ...(cause ? { cause } : {}) };
    });
  }

  async onTimePoints(): Promise<OnTimePoint[]> {
    // Termintreue nur für versendete Aufträge mit Zieltermin (ProductionOrder.dueDate)
    // und Lieferschein als Fertigstellungsbeleg.
    const orders = await prisma.order.findMany({
      where: {
        status: "VERSENDET",
        deliveryNotes: { some: {} },
        production: { dueDate: { not: null } },
      },
      select: {
        production: { select: { dueDate: true } },
        deliveryNotes: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    return orders.flatMap((o) => {
      const done = o.deliveryNotes[0]?.createdAt;
      const due = o.production?.dueDate ?? null;
      return done && due ? [{ at: done, onTime: isOnTime(done, due) }] : [];
    });
  }
}
