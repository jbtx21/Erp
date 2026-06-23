// Anwendungsfall: Auftrag → Produktionsauftrag (PA) erzeugen (Kap. 5.2). Ein Auftrag
// = ein Produktionsauftrag. Die Fertigungsstückliste (BomItems) entsteht aus den
// Auftragspositionen; Set-/Bundle-Positionen werden über ihre Komponenten-Stückliste
// (Kap. 5.1) mit der Positionsmenge expandiert. Kein Produktionsstart ohne Freigabe
// (Kap. 5.2/7.2). Der Laufzettel-PDF wird anschließend über den ProductionSheetService
// (T-11) aus dem PA gerendert.

import { explodeComponents, type VariantComponentDef } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface ProductionOrderLine {
  description: string;
  qty: number;
  variantId: string | null;
  isBundle: boolean;
  /** Stückliste der Set-Variante (leer, wenn keine Set-Position). */
  components: VariantComponentDef[];
}

export interface OrderForProduction {
  id: string;
  number: string;
  freigegeben: boolean;
  dueDate: Date | null;
  existingProductionId: string | null;
  existingProductionNumber: string | null;
  lines: ProductionOrderLine[];
}

/** Eine Fertigungsstücklisten-Position des Produktionsauftrags. */
export interface BomItemInput {
  description: string;
  qty: number;
  variantId: string | null;
}

export interface ProductionStatus {
  freigegeben: boolean;
  productionId: string | null;
  productionNumber: string | null;
}

export interface ProductionRepository {
  loadOrderForProduction(orderId: string): Promise<OrderForProduction | null>;
  createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; bomItems: BomItemInput[] }): Promise<{ id: string }>;
  /** Setzt den Auftrag auf IN_PRODUKTION (nur aus frühen Status). */
  setOrderInProduction(orderId: string): Promise<void>;
  /** Gibt den Auftrag für die Produktion frei (Kap. 5.2/7.2). */
  releaseOrder(orderId: string): Promise<void>;
  status(orderId: string): Promise<ProductionStatus | null>;
}

export class ProductionError extends Error {}

export class ProductionService {
  constructor(
    private readonly repo: ProductionRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  async status(orderId: string): Promise<ProductionStatus> {
    const s = await this.repo.status(orderId);
    if (!s) throw new ProductionError("Auftrag nicht gefunden.");
    return s;
  }

  /** Gibt den Auftrag für die Produktion frei (Voraussetzung für den PA, Kap. 5.2/7.2). */
  async release(orderId: string): Promise<void> {
    const s = await this.repo.status(orderId);
    if (!s) throw new ProductionError("Auftrag nicht gefunden.");
    if (s.freigegeben) return;
    await this.repo.releaseOrder(orderId);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { freigegeben: true } }));
  }

  /** Baut die Fertigungsstückliste aus den Auftragspositionen (Set → Komponenten × Menge). */
  static buildBomItems(lines: ProductionOrderLine[]): BomItemInput[] {
    const items: BomItemInput[] = [];
    for (const l of lines) {
      if (l.isBundle && l.components.length > 0) {
        for (const c of explodeComponents(l.components, l.qty)) {
          items.push({ description: c.description, qty: c.qty, variantId: c.componentVariantId });
        }
      } else {
        items.push({ description: l.description, qty: l.qty, variantId: l.variantId });
      }
    }
    return items;
  }

  /**
   * Auftrag → Produktionsauftrag. Erzeugt PA-Nummer + Fertigungsstückliste, setzt den
   * Auftrag auf IN_PRODUKTION. Wirft, wenn der Auftrag nicht freigegeben ist oder bereits
   * ein PA existiert (1 Auftrag = 1 PA).
   */
  async createFromOrder(orderId: string): Promise<{ id: string; number: string; bomItemCount: number }> {
    const order = await this.repo.loadOrderForProduction(orderId);
    if (!order) throw new ProductionError("Auftrag nicht gefunden.");
    if (order.existingProductionId) throw new ProductionError(`Produktionsauftrag ${order.existingProductionNumber ?? ""} existiert bereits.`);
    if (!order.freigegeben) throw new ProductionError("Auftrag ist nicht freigegeben — kein Produktionsstart ohne Freigabe (Kap. 5.2/7.2).");
    if (order.lines.length === 0) throw new ProductionError("Auftrag ohne Positionen kann nicht in Produktion gehen.");

    const bomItems = ProductionService.buildBomItems(order.lines);
    const number = await this.numbering.next("PRODUCTION_ORDER");
    const { id } = await this.repo.createProductionOrder({ number, orderId, dueDate: order.dueDate, bomItems });
    await this.repo.setOrderInProduction(orderId);
    await this.audit.append(buildEntry({
      entity: "ProductionOrder", entityId: id, action: "CREATE",
      after: { number, orderNumber: order.number, bomItems: bomItems.length },
    }));
    return { id, number, bomItemCount: bomItems.length };
  }
}
