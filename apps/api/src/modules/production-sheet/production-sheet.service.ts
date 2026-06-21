// Anwendungsfall: Produktionszettel erzeugen (Kap. 5.1 / T-11). Bindet die reine
// Validierungs-/Modell-Logik (@texma/shared) + den PDF-Renderer an die Produktionsdaten:
// Auftrag/Artikel/Farbe/Größe/Menge/Logo kommen aus der DB, die vorlagenspezifischen
// Felder (Maschinenparameter bzw. Dienstleister/Positionierung/Termine) als Eingabe.
// Fehlende Pflichtfelder → ProductionSheetIncompleteError (kein unvollständiger Zettel).

import {
  buildProductionSheet,
  type ProductionSheetInput,
  type ProductionSheetKind,
} from "@texma/shared";
import { renderProductionSheetPdf } from "../../pdf/production-sheet-pdf.js";

export interface ProductionSheetRepository {
  /** DB-ableitbare Basisfelder eines Produktionsauftrags (null = unbekannt). */
  gatherBase(productionId: string): Promise<Partial<ProductionSheetInput> | null>;
}

export interface RenderInput {
  productionId: string;
  kind: ProductionSheetKind;
  /** Vorlagenspezifische Felder (Maschinenparameter / Dienstleister + Termine). */
  extra: Partial<ProductionSheetInput>;
}

export interface RenderedSheet {
  fileName: string;
  title: string;
  /** Druckbereites PDF als base64. */
  pdfBase64: string;
}

export class ProductionSheetService {
  constructor(private readonly repo: ProductionSheetRepository) {}

  async render(input: RenderInput): Promise<RenderedSheet> {
    const base = await this.repo.gatherBase(input.productionId);
    const merged = { ...(base ?? {}), ...input.extra } as ProductionSheetInput;

    // wirft ProductionSheetIncompleteError, wenn Pflichtfelder fehlen
    const model = buildProductionSheet(merged, input.kind);
    const bytes = await renderProductionSheetPdf(model);

    return {
      fileName: `Produktionszettel-${merged.orderNumber}-${input.kind}.pdf`,
      title: model.title,
      pdfBase64: Buffer.from(bytes).toString("base64"),
    };
  }
}
