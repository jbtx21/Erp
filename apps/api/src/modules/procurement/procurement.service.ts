// Anwendungsfall: Produktionsstart-Gate bei Multi-Lieferant-Beschaffung (Kap. 5.6 / T-05).
// Bindet die reine `canStartProduction`/`componentReceiptStatus`-Logik (@texma/shared) an
// die Bestellungen + Wareneingänge eines Produktionsauftrags. Der Start ist erst frei,
// wenn jede benötigte Komponente vollständig im Wareneingang gebucht ist. Reine Lese-Prüfung
// (kein Audit); Repository als Interface → testbar ohne DB.

import {
  canStartProduction,
  componentReceiptStatus,
  type ComponentStatus,
  type GoodsReceiptLine,
  type RequiredComponent,
} from "@texma/shared";

export interface ProductionRef {
  id: string;
  number: string;
  orderNumber: string | null;
}

export interface ProcurementRepository {
  /** Benötigte Komponenten (aus den Bestellpositionen der PA-Bestellungen). */
  requiredComponents(productionId: string): Promise<RequiredComponent[]>;
  /** Gebuchte Wareneingänge (aus den Wareneingängen der PA-Bestellungen). */
  receivedComponents(productionId: string): Promise<GoodsReceiptLine[]>;
  /** Lesbare Bezeichnungen je Komponente (Variante + Lieferant) — gegen Roh-ID-Anzeige. */
  componentRefs(productionId: string): Promise<Array<{ variantId: string; label: string; supplierName: string }>>;
  /** Produktionsaufträge für die Auswahl (neueste zuerst) — ID-Picker statt Freitext. */
  listProductions(): Promise<ProductionRef[]>;
  /** Produktionsauftrag eines Auftrags (für das Start-Gate); null = keiner angelegt. */
  productionForOrder(orderId: string): Promise<{ id: string } | null>;
}

/** Komponentenstatus mit aufgelösten Namen (für die Anzeige statt cuids). */
export interface ComponentStatusView extends ComponentStatus {
  label: string;
  supplierName: string;
}

export interface ProductionStartStatus {
  productionId: string;
  components: ComponentStatusView[];
  /** true nur, wenn ALLE Komponenten vollständig eingegangen sind (T-05). */
  canStart: boolean;
}

export class ProcurementService {
  constructor(private readonly repo: ProcurementRepository) {}

  listProductions(): Promise<ProductionRef[]> {
    return this.repo.listProductions();
  }

  /**
   * Start-Gate (T-05) für den Auftrags-Statuswechsel → IN_PRODUKTION: blockiert nur, wenn
   * ein Produktionsauftrag MIT Beschaffung existiert und der Wareneingang unvollständig ist.
   * Ohne Produktionsauftrag oder ohne externe Komponenten greift kein Gate (nicht blockierend).
   */
  async startGateForOrder(orderId: string): Promise<{ blocked: boolean; reason?: string }> {
    const prod = await this.repo.productionForOrder(orderId);
    if (!prod) return { blocked: false };
    const status = await this.productionStartStatus(prod.id);
    if (status.components.length === 0 || status.canStart) return { blocked: false };
    const offen = status.components.filter((c) => !c.complete).map((c) => c.label);
    return { blocked: true, reason: `Produktionsstart gesperrt (T-05): Wareneingang unvollständig für ${offen.length} Komponente(n) (${offen.join(", ")}). Erst alle Wareneingänge buchen.` };
  }

  async productionStartStatus(productionId: string): Promise<ProductionStartStatus> {
    const [required, receipts, refs] = await Promise.all([
      this.repo.requiredComponents(productionId),
      this.repo.receivedComponents(productionId),
      this.repo.componentRefs(productionId),
    ]);
    // Roh-IDs (cuid) durch lesbare Bezeichnungen ersetzen — Bucket A: keine ID-Anzeige.
    const byVariant = new Map(refs.map((r) => [r.variantId, r]));
    const components: ComponentStatusView[] = componentReceiptStatus(required, receipts).map((c) => {
      const ref = byVariant.get(c.variantId);
      return { ...c, label: ref?.label ?? c.variantId, supplierName: ref?.supplierName ?? c.supplierId };
    });
    return {
      productionId,
      components,
      canStart: canStartProduction(required, receipts),
    };
  }
}
