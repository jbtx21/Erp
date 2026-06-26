// Anwendungsfall: Auftrag → Produktionsauftrag (PA) erzeugen (Kap. 5.2). Ein Auftrag
// = ein Produktionsauftrag. Die Fertigungsstückliste (BomItems) entsteht aus den
// Auftragspositionen; Set-/Bundle-Positionen werden über ihre Komponenten-Stückliste
// (Kap. 5.1) mit der Positionsmenge expandiert. Kein Produktionsstart ohne Freigabe
// (Kap. 5.2/7.2). Der Laufzettel-PDF wird anschließend über den ProductionSheetService
// (T-11) aus dem PA gerendert.

import {
  checkApproval,
  explodeComponents,
  FINISHING_LEAD_PROFILES,
  proposeProductionDueDate,
  subtractWorkingDays,
  type ApprovalThresholds,
  type FinishingLeadProfile,
  type VariantComponentDef,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface ProductionOrderLine {
  description: string;
  qty: number;
  variantId: string | null;
  isBundle: boolean;
  /** Stückliste der Set-Variante (leer, wenn keine Set-Position). */
  components: VariantComponentDef[];
  /** Zugewiesener Veredler des (Veredelungs-)Artikels — Quelle der Fremdvergabe (T-04). */
  veredlerId: string | null;
}

/** Auto-Fremdvergabe-Stufe (T-04), beim externen PA aus den Veredlern der Positionen. */
export interface SubOrderInput {
  number: string;
  sequence: number;
  supplierId: string;
}

export interface OrderForProduction {
  id: string;
  number: string;
  freigegeben: boolean;
  /** Zugesagter Liefertermin (Basis der Rückwärtsterminierung); null = kein Termin. */
  deliveryDate: Date | null;
  /** Längste Beschaffungs-Lieferzeit (Werktage) der Hauptlieferanten nicht bestandsgeführter
   *  Positionen (Procure-to-Order); null = nichts zu beschaffen / keine Lieferzeit gepflegt. */
  procurementLeadDays: number | null;
  existingProductionId: string | null;
  existingProductionNumber: string | null;
  lines: ProductionOrderLine[];
}

/** Terminvorschlag für die Produktion (Werktage-Rückwärtsterminierung, manuell zu bestätigen). */
export interface SchedulePreview {
  deliveryDate: Date | null;
  profile: FinishingLeadProfile;
  profileLabel: string;
  leadWorkingDays: number;
  external: boolean;
  /** Vorgeschlagene Produktions-Fälligkeit (null ohne Liefertermin). */
  proposedDueDate: Date | null;
  /** Beschaffungs-Lieferzeit der Hauptlieferanten (Werktage); null = nichts zu beschaffen. */
  procurementLeadDays: number | null;
  /** Spätestes Bestelldatum beim Lieferanten = Produktionsstart − Beschaffungs-Lieferzeit
   *  (Procure-to-Order: erst beschaffen, dann veredeln). Null ohne Liefertermin/Lieferzeit. */
  proposedOrderDate: Date | null;
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
  /** Gewählter Veredelungsweg + bestätigter Produktionstermin (null, wenn kein PA). */
  finishingProfile: FinishingLeadProfile | null;
  dueDate: Date | null;
}

export interface ProductionRepository {
  loadOrderForProduction(orderId: string): Promise<OrderForProduction | null>;
  createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; finishingProfile: string | null; bomItems: BomItemInput[]; subOrders: SubOrderInput[] }): Promise<{ id: string }>;
  /** Setzt den Auftrag auf IN_PRODUKTION (nur aus frühen Status). */
  setOrderInProduction(orderId: string): Promise<void>;
  /** Gibt den Auftrag für die Produktion frei (Kap. 5.2/7.2). */
  releaseOrder(orderId: string): Promise<void>;
  status(orderId: string): Promise<ProductionStatus | null>;
  /** Kennzahlen für das Freigabe-Gate (K-10): Auftragswert + höchster Positionsrabatt. */
  approvalFacts(orderId: string): Promise<{ orderValueCents: number; discountPct: number } | null>;
  /** Ersetzt die Fertigungsstückliste eines PA (nach Auftragsbearbeitung). */
  replaceBomItems(productionId: string, items: BomItemInput[]): Promise<void>;
}

/** Optionen der Freigabe: GL-Gate gegen die Schwellen (K-10). */
export interface ReleaseOptions {
  /** Rolle des Freigebenden; nur ADMIN darf über den Schwellen freigeben. */
  role?: string;
  /** Freigabeschwellen (aus den Einstellungen); ohne Angabe greift kein Gate. */
  thresholds?: ApprovalThresholds;
}

const APPROVAL_REASON_TEXT: Record<string, string> = {
  RABATT_UEBER_SCHWELLE: "Rabatt über der Freigabegrenze",
  AUFTRAGSWERT_UEBER_SCHWELLE: "Auftragswert über der Freigabegrenze",
};

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
  async release(orderId: string, opts: ReleaseOptions = {}): Promise<void> {
    const s = await this.repo.status(orderId);
    if (!s) throw new ProductionError("Auftrag nicht gefunden.");
    if (s.freigegeben) return;

    // Freigabe-Gate (K-10): über der Rabatt-/Wertgrenze nur durch die Geschäftsleitung.
    if (opts.thresholds && opts.role !== "ADMIN") {
      const facts = await this.repo.approvalFacts(orderId);
      if (facts) {
        const chk = checkApproval(facts, opts.thresholds);
        if (chk.required) {
          const why = chk.reasons.map((r) => APPROVAL_REASON_TEXT[r] ?? r).join(", ");
          throw new ProductionError(`Freigabe nur durch die Geschäftsleitung (${why}).`);
        }
      }
    }

    await this.repo.releaseOrder(orderId);
    // Freigabe koppelt den Auftragsstatus: der freigegebene Auftrag geht in Produktion
    // (sichtbar in Liste/Status, nicht erst bei PA-Anlage). Guard im Repo schaltet nur
    // aus frühen Status (ANGELEGT/IN_BEARBEITUNG) — spätere Status bleiben unberührt.
    await this.repo.setOrderInProduction(orderId);
    await this.audit.append(buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { freigegeben: true, status: "IN_PRODUKTION", freigegebenVon: opts.role ?? null } }));
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
   * Terminvorschlag (Werktage-Rückwärtsterminierung) für die gewählte Veredelungsart.
   * Reiner Vorschlag — stückzahlabhängig, IMMER manuell zu prüfen/bestätigen.
   */
  async previewSchedule(orderId: string, profile: FinishingLeadProfile): Promise<SchedulePreview> {
    const order = await this.repo.loadOrderForProduction(orderId);
    if (!order) throw new ProductionError("Auftrag nicht gefunden.");
    const def = FINISHING_LEAD_PROFILES[profile];
    const proposedDueDate = order.deliveryDate ? proposeProductionDueDate(order.deliveryDate, def.leadWorkingDays) : null;
    // Procure-to-Order: das Material muss VOR dem Produktionsstart da sein → spätestes
    // Bestelldatum = Produktionsstart − Beschaffungs-Lieferzeit (Werktage).
    const lead = order.procurementLeadDays;
    const proposedOrderDate = proposedDueDate && lead != null ? subtractWorkingDays(proposedDueDate, lead) : null;
    return {
      deliveryDate: order.deliveryDate,
      profile,
      profileLabel: def.label,
      leadWorkingDays: def.leadWorkingDays,
      external: def.external,
      proposedDueDate,
      procurementLeadDays: lead,
      proposedOrderDate,
    };
  }

  /**
   * Auftrag → Produktionsauftrag. Erzeugt PA-Nummer + Fertigungsstückliste, setzt den
   * Auftrag auf IN_PRODUKTION. Wirft, wenn der Auftrag nicht freigegeben ist oder bereits
   * ein PA existiert (1 Auftrag = 1 PA). Der Produktionstermin (`dueDate`) wird vom
   * Innendienst manuell bestätigt übergeben; ohne Angabe gilt der zugesagte Liefertermin.
   */
  /**
   * Baut die Fertigungsstückliste eines bestehenden PA neu auf — nach einer
   * Auftragsbearbeitung, damit die Produktion zu den geänderten Positionen passt.
   * No-op, wenn (noch) kein PA existiert.
   */
  async rebuildBomForOrder(orderId: string): Promise<{ rebuilt: boolean; bomItemCount: number }> {
    const order = await this.repo.loadOrderForProduction(orderId);
    if (!order || !order.existingProductionId) return { rebuilt: false, bomItemCount: 0 };
    const bomItems = ProductionService.buildBomItems(order.lines);
    await this.repo.replaceBomItems(order.existingProductionId, bomItems);
    await this.audit.append(buildEntry({ entity: "ProductionOrder", entityId: order.existingProductionId, action: "UPDATE", after: { bomItems: bomItems.length, grund: "Auftragsbearbeitung" } }));
    return { rebuilt: true, bomItemCount: bomItems.length };
  }

  /**
   * Auto-Fremdvergabe (T-04): je distinktem zugewiesenem Veredler der Positionen eine Stufe.
   * Eine Position mit hinterlegtem Veredler IST eine Lohnveredelung (wir stellen dem Veredler
   * Material bei) — unabhängig vom gewählten Veredelungsweg, der nur die interne Terminierung
   * steuert. So gehen externe Veredelungen nie verloren, auch wenn der Innendienst einen
   * „inhouse"-Weg gewählt hat (verifiziert an AB-2026-0006).
   */
  static buildSubOrders(paNumber: string, _profile: FinishingLeadProfile | null, lines: ProductionOrderLine[]): SubOrderInput[] {
    const veredler = [...new Set(lines.map((l) => l.veredlerId).filter((x): x is string => !!x))];
    return veredler.map((supplierId, i) => ({ number: `${paNumber}-${String.fromCharCode(97 + i)}`, sequence: i + 1, supplierId }));
  }

  async createFromOrder(orderId: string, opts: { dueDate?: Date | null; profile?: FinishingLeadProfile } = {}): Promise<{ id: string; number: string; bomItemCount: number; subOrderCount: number; dueDate: Date | null }> {
    const order = await this.repo.loadOrderForProduction(orderId);
    if (!order) throw new ProductionError("Auftrag nicht gefunden.");
    if (order.existingProductionId) throw new ProductionError(`Produktionsauftrag ${order.existingProductionNumber ?? ""} existiert bereits.`);
    if (!order.freigegeben) throw new ProductionError("Auftrag ist nicht freigegeben — kein Produktionsstart ohne Freigabe (Kap. 5.2/7.2).");
    if (order.lines.length === 0) throw new ProductionError("Auftrag ohne Positionen kann nicht in Produktion gehen.");

    const bomItems = ProductionService.buildBomItems(order.lines);
    const dueDate = "dueDate" in opts ? opts.dueDate ?? null : order.deliveryDate;
    const finishingProfile = opts.profile ?? null;
    const number = await this.numbering.next("PRODUCTION_ORDER");
    const subOrders = ProductionService.buildSubOrders(number, finishingProfile, order.lines);
    const { id } = await this.repo.createProductionOrder({ number, orderId, dueDate, finishingProfile, bomItems, subOrders });
    await this.repo.setOrderInProduction(orderId);
    await this.audit.append(buildEntry({
      entity: "ProductionOrder", entityId: id, action: "CREATE",
      after: { number, orderNumber: order.number, bomItems: bomItems.length, fremdvergaben: subOrders.length, liefertermin: order.deliveryDate, produktionstermin: dueDate, veredelungsweg: finishingProfile },
    }));
    return { id, number, bomItemCount: bomItems.length, subOrderCount: subOrders.length, dueDate };
  }
}
