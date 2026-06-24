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
  /** Produktionsaufträge für die Auswahl (neueste zuerst) — ID-Picker statt Freitext. */
  listProductions(): Promise<ProductionRef[]>;
  /** Produktionsauftrag eines Auftrags (für das Start-Gate); null = keiner angelegt. */
  productionForOrder(orderId: string): Promise<{ id: string } | null>;
}

export interface ProductionStartStatus {
  productionId: string;
  components: ComponentStatus[];
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
    const offen = status.components.filter((c) => !c.complete).map((c) => c.variantId);
    return { blocked: true, reason: `Produktionsstart gesperrt (T-05): Wareneingang unvollständig für ${offen.length} Komponente(n). Erst alle Wareneingänge buchen.` };
  }

  async productionStartStatus(productionId: string): Promise<ProductionStartStatus> {
    const [required, receipts] = await Promise.all([
      this.repo.requiredComponents(productionId),
      this.repo.receivedComponents(productionId),
    ]);
    return {
      productionId,
      components: componentReceiptStatus(required, receipts),
      canStart: canStartProduction(required, receipts),
    };
  }
}
