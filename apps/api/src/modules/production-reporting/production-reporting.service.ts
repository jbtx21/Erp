// Anwendungsfall: operatives Produktions-Reporting (Kap. 29/35). Bindet die reine
// Kennzahlenlogik (@texma/shared: Durchlaufzeit/Fehlerquote) an die Auftrags-,
// Lieferschein- und Reklamationsdaten. Bewusst OHNE Geld-/Kundenfelder — diese
// Auswertungen sind operativ und damit auch für PRODUKTION zugänglich (RBAC, Kap. 12).
// Repository als Interface → testbar ohne DB.

import {
  bucketDefectRate,
  bucketLeadTime,
  bucketOnTimeRate,
  computeLeadTimeStats,
  defectRate,
  defectsByCause,
  onTimeRate,
  type DefectBucket,
  type DefectCause,
  type DefectPoint,
  type Granularity,
  type LeadTimeBucket,
  type LeadTimePoint,
  type LeadTimeStats,
  type OnTimeBucket,
  type OnTimePoint,
} from "@texma/shared";

export interface ProductionReportingRepository {
  /** Je fertiggestelltem (versendetem) Auftrag: Fertigstellung + Durchlaufzeit. */
  leadTimePoints(): Promise<LeadTimePoint[]>;
  /** Je Auftrag: Auftragsdatum + ob reklamiert (mit Ursache). */
  defectPoints(): Promise<DefectPoint[]>;
  /** Je fertiggestelltem Auftrag mit Zieltermin: Fertigstellung + ob pünktlich. */
  onTimePoints(): Promise<OnTimePoint[]>;
}

export interface LeadTimeOverview {
  granularity: Granularity;
  buckets: LeadTimeBucket[];
  stats: LeadTimeStats;
}

export interface DefectOverview {
  granularity: Granularity;
  buckets: DefectBucket[];
  /** Gesamt-Fehlerquote über alle Aufträge. */
  overall: { total: number; defects: number; ratePercent: number | null };
  /** Reklamationen je Ursache (Ursachenanalyse, Kap. 20). */
  byCause: Record<DefectCause, number>;
}

export interface OnTimeOverview {
  granularity: Granularity;
  buckets: OnTimeBucket[];
  /** Gesamt-Termintreue über alle Aufträge mit Zieltermin. */
  overall: { total: number; onTime: number; ratePercent: number | null };
}

export class ProductionReportingService {
  constructor(private readonly repo: ProductionReportingRepository) {}

  /** Durchlaufzeit-Übersicht je Periode + Gesamtkennzahlen (Kap. 29/35). */
  async leadTimeOverview(granularity: Granularity): Promise<LeadTimeOverview> {
    const points = await this.repo.leadTimePoints();
    return {
      granularity,
      buckets: bucketLeadTime(points, granularity),
      stats: computeLeadTimeStats(points),
    };
  }

  /** Fehlerquoten-Übersicht je Periode + Gesamt + Ursachen (Kap. 20/29). */
  async defectOverview(granularity: Granularity): Promise<DefectOverview> {
    const points = await this.repo.defectPoints();
    return {
      granularity,
      buckets: bucketDefectRate(points, granularity),
      overall: defectRate(points),
      byCause: defectsByCause(points),
    };
  }

  /** Termintreue-Übersicht je Periode + Gesamt (Kap. 35.4/29). */
  async onTimeOverview(granularity: Granularity): Promise<OnTimeOverview> {
    const points = await this.repo.onTimePoints();
    return {
      granularity,
      buckets: bucketOnTimeRate(points, granularity),
      overall: onTimeRate(points),
    };
  }
}
