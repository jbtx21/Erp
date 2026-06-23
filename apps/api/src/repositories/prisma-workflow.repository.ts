// Prisma-Workflow: leitet die Routen-Merkmale aus dem Auftrag ab (Veredelungs-
// positionen = intern; Fremdvergabe/SubProductionOrder = extern). Die Route ist im
// UI überschreibbar (assignRoute mit explizitem Wert).

import { prisma } from "@texma/db";
import type { OrderRoute } from "@texma/shared";
import type { WorkflowRepository } from "../modules/workflow/workflow.service.js";

export class PrismaWorkflowRepository implements WorkflowRepository {
  async orderFlags(orderId: string): Promise<{ exists: boolean; hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean }> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        lines: { select: { kind: true } },
        production: { select: { subOrders: { select: { id: true } } } },
      },
    });
    if (!o) return { exists: false, hasVeredelung: false, hasIntern: false, hasExtern: false };
    const hasVeredelung = o.lines.some((l) => l.kind === "VEREDELUNG");
    const hasExtern = (o.production?.subOrders.length ?? 0) > 0;
    const hasIntern = hasVeredelung; // Veredelungsposition im Haus (sofern nicht rein extern)
    return { exists: true, hasVeredelung: hasVeredelung || hasExtern, hasIntern, hasExtern };
  }
  async getRoute(orderId: string): Promise<{ route: OrderRoute | null; stepIndex: number } | null> {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { route: true, routeStepIndex: true } });
    return o ? { route: (o.route as OrderRoute | null), stepIndex: o.routeStepIndex } : null;
  }
  async setRoute(orderId: string, route: OrderRoute, stepIndex: number): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { route: route as never, routeStepIndex: stepIndex } });
  }
  async setStepIndex(orderId: string, stepIndex: number): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { routeStepIndex: stepIndex } });
  }
}
