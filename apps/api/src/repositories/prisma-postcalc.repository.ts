// Prisma-Implementierung des Nachkalkulations-Repositories (Produktionspfad, T-10).
// Ist: Umsatz aus den Auftragspositionen, Material aus den Bestellpositionen der PA
// (PO→productionId), Lohn-Minuten aus der Zeiterfassung.

import { prisma } from "@texma/db";
import type { CostSide } from "@texma/shared";
import type { PostCalcRepository } from "../modules/postcalc/postcalc.service.js";

export class PrismaPostCalcRepository implements PostCalcRepository {
  async actuals(productionId: string, laborRateCentsPerMinute: number): Promise<CostSide | null> {
    const prod = await prisma.productionOrder.findUnique({
      where: { id: productionId },
      select: { order: { select: { lines: { select: { qty: true, unitNetCents: true } } } } },
    });
    if (!prod) return null;

    const revenueCents = prod.order.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0);

    const poLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { productionId } },
      select: { qty: true, ekCents: true },
    });
    const materialCents = poLines.reduce((s, l) => s + l.qty * l.ekCents, 0);

    const time = await prisma.timeEntry.aggregate({ where: { productionId }, _sum: { minutes: true } });
    const laborMinutes = time._sum.minutes ?? 0;

    return { revenueCents, materialCents, laborMinutes, laborRateCentsPerMinute };
  }

  async planFor(productionId: string, laborRateCentsPerMinute: number): Promise<CostSide | null> {
    const prod = await prisma.productionOrder.findUnique({
      where: { id: productionId },
      select: { order: { select: { lines: { select: { qty: true, unitNetCents: true, dbCents: true, variantId: true } } } } },
    });
    if (!prod) return null;

    const lines = prod.order.lines;
    const revenueCents = lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0);
    // Plan-Material = Umsatz − Plan-Deckungsbeitrag (dbCents = VK − EK je Stück).
    const plannedDbCents = lines.reduce((s, l) => s + l.qty * (l.dbCents ?? 0), 0);
    const materialCents = Math.max(0, revenueCents - plannedDbCents);

    // Plan-Lohnminuten aus den Veredelungs-Sollzeiten (FinishingTargetTime) der Positionen.
    const laborMinutes = await this.planLaborMinutes(lines);

    return { revenueCents, materialCents, laborMinutes, laborRateCentsPerMinute };
  }

  /** Summiert die Sollminuten der Veredelungs-Positionen (Methode → FinishingTargetTime). */
  private async planLaborMinutes(lines: { qty: number; variantId: string | null }[]): Promise<number> {
    const variantIds = [...new Set(lines.map((l) => l.variantId).filter((x): x is string => !!x))];
    if (variantIds.length === 0) return 0;

    const variants = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, article: { select: { type: true, finishingSpecs: { select: { method: true, stitchCount: true } } } } },
    });
    const byVariant = new Map(variants.map((v) => [v.id, v.article]));

    const targets = await prisma.finishingTargetTime.findMany({ select: { kind: true, targetMinutes: true, basis: true } });
    const targetByKind = new Map(targets.map((t) => [t.kind as string, t]));
    // FinishingMethod (Artikel) → FinishingKind (Sollzeit).
    const methodToKind: Record<string, string> = { STICK: "STICK", DRUCK: "SIEBDRUCK_DRUCK", DRUCK_DIGITAL: "SIEBDRUCK_DRUCK", TRANSFER: "TRANSFER" };

    let minutes = 0;
    for (const l of lines) {
      const art = l.variantId ? byVariant.get(l.variantId) : undefined;
      if (art?.type !== "FINISHING") continue;
      for (const spec of art.finishingSpecs) {
        const t = targetByKind.get(methodToKind[spec.method] ?? "");
        if (!t) continue;
        if (t.basis === "PRO_1000_STICHE") minutes += t.targetMinutes * ((spec.stitchCount ?? 0) / 1000) * l.qty;
        else if (t.basis === "EINRICHTUNG") minutes += t.targetMinutes; // einmalig je Veredelung
        else minutes += t.targetMinutes * l.qty; // STUECK
        // Siebdruck zusätzlich Einrichtung (einmalig), falls konfiguriert.
        if (spec.method === "DRUCK") {
          const setup = targetByKind.get("SIEBDRUCK_EINRICHTUNG");
          if (setup) minutes += setup.targetMinutes;
        }
      }
    }
    return Math.round(minutes);
  }
}
