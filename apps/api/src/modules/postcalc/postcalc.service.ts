// Anwendungsfall: Nachkalkulation Soll-Ist (Kap. 5.2/9.3 / T-10). Bindet die reine
// `postCalc`-Logik (@texma/shared) an die Ist-Daten eines Produktionsauftrags: Umsatz
// aus den Auftragspositionen, Material aus den Bestellpositionen (PO→PA), Lohn aus der
// Zeiterfassung × Stundensatz. Die Plan-Seite kommt aus der Angebotskalkulation und
// wird übergeben. Reine Lese-Analyse (kein Audit); Repository als Interface.

import { postCalc, type CostSide, type PostCalcResult } from "@texma/shared";

export interface PostCalcRepository {
  /** Ist-Kostenseite eines Produktionsauftrags (null, wenn PA unbekannt). */
  actuals(productionId: string, laborRateCentsPerMinute: number): Promise<CostSide | null>;
  /**
   * Plan-Kostenseite aus dem Auftrag: Umsatz aus den Positionen, Material aus dem
   * hinterlegten Plan-Deckungsbeitrag (Material = Umsatz − Plan-DB), Plan-Lohnminuten
   * aus den Veredelungs-Sollzeiten (FinishingTargetTime). null, wenn PA unbekannt.
   */
  planFor(productionId: string, laborRateCentsPerMinute: number): Promise<CostSide | null>;
}

export interface ComputeInput {
  productionId: string;
  /** Plan-Kostenseite aus der Angebotskalkulation. */
  plan: CostSide;
  /** Stundensatz (Cent/Minute) für die Ist-Lohnkosten. */
  istLaborRateCentsPerMinute: number;
}

export interface ComputeForProductionInput {
  productionId: string;
  /** Stundensatz (Cent/Minute) für Plan- und Ist-Lohn. */
  laborRateCentsPerMinute: number;
  /** Manuelle Plan-Lohnminuten (stückzahlabhängig) — überschreibt die Sollzeit-Ableitung. */
  planLaborMinutes?: number;
}

export class PostCalcService {
  constructor(private readonly repo: PostCalcRepository) {}

  async compute(input: ComputeInput): Promise<PostCalcResult> {
    const ist = await this.repo.actuals(input.productionId, input.istLaborRateCentsPerMinute);
    if (!ist) {
      throw new Error(`Produktionsauftrag ${input.productionId} nicht gefunden.`);
    }
    return postCalc(input.plan, ist);
  }

  /** Soll-Ist mit automatisch abgeleiteter Plan-Seite (Plan-DB aus dem Auftrag). */
  async computeForProduction(input: ComputeForProductionInput): Promise<PostCalcResult> {
    const [plan, ist] = await Promise.all([
      this.repo.planFor(input.productionId, input.laborRateCentsPerMinute),
      this.repo.actuals(input.productionId, input.laborRateCentsPerMinute),
    ]);
    if (!plan || !ist) throw new Error(`Produktionsauftrag ${input.productionId} nicht gefunden.`);
    const planSide: CostSide = input.planLaborMinutes !== undefined ? { ...plan, laborMinutes: input.planLaborMinutes } : plan;
    return postCalc(planSide, ist);
  }
}
