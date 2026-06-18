// Prisma-Implementierung des Ampel-Repositories (Produktionspfad, Kap. 35.4).
// Terminierte Vorgänge: Angebote mit Wiedervorlage (erledigt = angenommen/abgelehnt)
// und Produktionsaufträge mit Liefertermin (erledigt = Auftrag versendet).

import { prisma } from "@texma/db";
import type { TrackedProcess } from "@texma/shared";
import type { AmpelRepository } from "../modules/ampel/ampel.service.js";

export class PrismaAmpelRepository implements AmpelRepository {
  async trackedProcesses(): Promise<TrackedProcess[]> {
    const [quotes, productions] = await Promise.all([
      prisma.quote.findMany({
        where: { wiedervorlageAm: { not: null } },
        select: { id: true, number: true, wiedervorlageAm: true, status: true },
      }),
      prisma.productionOrder.findMany({
        where: { dueDate: { not: null } },
        select: { id: true, number: true, dueDate: true, order: { select: { status: true } } },
      }),
    ]);

    const angebote: TrackedProcess[] = quotes.map((q) => ({
      id: q.id,
      level: "ANGEBOT",
      label: q.number,
      dueDate: q.wiedervorlageAm as Date,
      done: q.status === "ANGENOMMEN" || q.status === "ABGELEHNT",
    }));

    const pas: TrackedProcess[] = productions.map((p) => ({
      id: p.id,
      level: "PRODUKTION",
      label: p.number,
      dueDate: p.dueDate as Date,
      done: p.order.status === "VERSENDET",
    }));

    return [...angebote, ...pas];
  }
}
