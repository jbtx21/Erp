// Prisma-Implementierung des Continuity-Repositories (Produktionspfad, B17).
// Offline-Bundle: offene Produktionsaufträge (Auftrag nicht versendet/storniert)
// mit den Basis-Produktionsfeldern. recordFeedback ist race-frei idempotent über
// den eindeutigen idempotencyKey.

import { prisma } from "@texma/db";
import type { OfflineBundleOrder } from "@texma/shared";
import type {
  ContinuityRepository,
  ProductionFeedback,
} from "../modules/continuity/continuity.service.js";

export class PrismaContinuityRepository implements ContinuityRepository {
  async openBundleOrders(): Promise<OfflineBundleOrder[]> {
    const prods = await prisma.productionOrder.findMany({
      where: { order: { status: { notIn: ["VERSENDET", "STORNIERT"] } } },
      select: {
        order: {
          select: {
            number: true,
            company: {
              select: { logoVersions: { where: { active: true }, select: { version: true }, take: 1 } },
            },
          },
        },
        bomItems: {
          where: { variantId: { not: null } },
          take: 1,
          select: {
            qty: true,
            variant: {
              select: {
                article: { select: { name: true } },
                attributes: { select: { name: true, value: true } },
              },
            },
          },
        },
      },
    });

    return prods.map((p) => {
      const bom = p.bomItems[0];
      const attrs = new Map((bom?.variant?.attributes ?? []).map((a) => [a.name, a.value]));
      const logo = p.order.company.logoVersions[0];
      return {
        orderNumber: p.order.number,
        articleName: bom?.variant?.article.name ?? "",
        farbe: attrs.get("Farbe") ?? "",
        groesse: attrs.get("Größe") ?? "",
        qty: bom?.qty ?? 0,
        logoLabel: logo ? `Logo v${logo.version}` : "",
      };
    });
  }

  async recordFeedback(fb: ProductionFeedback): Promise<{ id: string; created: boolean }> {
    const existing = await prisma.timeEntry.findUnique({
      where: { idempotencyKey: fb.idempotencyKey },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    try {
      const created = await prisma.timeEntry.create({
        data: {
          productionId: fb.productionId,
          userId: fb.userId,
          minutes: fb.minutes,
          note: fb.note ?? null,
          idempotencyKey: fb.idempotencyKey,
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    } catch {
      // Unique-Race: derselbe Schlüssel kam parallel an → vorhandenen Eintrag nutzen.
      const again = await prisma.timeEntry.findUnique({
        where: { idempotencyKey: fb.idempotencyKey },
        select: { id: true },
      });
      if (again) return { id: again.id, created: false };
      throw new Error(`recordFeedback fehlgeschlagen für ${fb.idempotencyKey}`);
    }
  }
}
