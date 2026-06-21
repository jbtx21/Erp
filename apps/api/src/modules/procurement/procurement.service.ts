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

export interface ProcurementRepository {
  /** Benötigte Komponenten (aus den Bestellpositionen der PA-Bestellungen). */
  requiredComponents(productionId: string): Promise<RequiredComponent[]>;
  /** Gebuchte Wareneingänge (aus den Wareneingängen der PA-Bestellungen). */
  receivedComponents(productionId: string): Promise<GoodsReceiptLine[]>;
}

export interface ProductionStartStatus {
  productionId: string;
  components: ComponentStatus[];
  /** true nur, wenn ALLE Komponenten vollständig eingegangen sind (T-05). */
  canStart: boolean;
}

export class ProcurementService {
  constructor(private readonly repo: ProcurementRepository) {}

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
