// In-Memory-Implementierung des Produktions-Reporting-Repositories — für Tests.

import type { DefectPoint, LeadTimePoint } from "@texma/shared";
import type { ProductionReportingRepository } from "../modules/production-reporting/production-reporting.service.js";

export class InMemoryProductionReportingRepository implements ProductionReportingRepository {
  constructor(
    private readonly leadTimes: LeadTimePoint[] = [],
    private readonly defects: DefectPoint[] = []
  ) {}

  async leadTimePoints(): Promise<LeadTimePoint[]> {
    return this.leadTimes;
  }

  async defectPoints(): Promise<DefectPoint[]> {
    return this.defects;
  }
}
