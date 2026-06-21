// Prisma-Implementierung der Rückwärtsterminierung (Produktionspfad, B9). Die
// Lead-Stufen werden aus den konfigurierten Veredelungs-Durchlaufzeiten
// (FinishingTargetTime) abgeleitet: targetMinutes → Tage (8-h-Arbeitstag, mind. 1).
//
// Vereinfachung: es werden die global konfigurierten Veredelungsstufen verwendet;
// die auftragsindividuelle Stufenauswahl (welche Veredelung der Auftrag nutzt) wird
// nachgezogen, sobald der Auftrag→Veredelung-Bezug strukturiert modelliert ist.

import { prisma } from "@texma/db";
import type {
  SchedulingInput,
  SchedulingRepository,
} from "../modules/scheduling/scheduling.service.js";

const WORK_MINUTES_PER_DAY = 480;

export class PrismaSchedulingRepository implements SchedulingRepository {
  async loadSchedulingInput(orderId: string): Promise<SchedulingInput | null> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { zugesagterLiefertermin: true },
    });
    if (!order?.zugesagterLiefertermin) return null;

    const times = await prisma.finishingTargetTime.findMany({
      select: { kind: true, targetMinutes: true },
      orderBy: { kind: "asc" },
    });
    const stages = times.map((t) => ({
      label: t.kind,
      durationDays: Math.max(1, Math.ceil(t.targetMinutes / WORK_MINUTES_PER_DAY)),
    }));

    return { deliveryDate: order.zugesagterLiefertermin, stages };
  }
}
