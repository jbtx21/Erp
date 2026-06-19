// In-Memory-Implementierung des Produktions-Reporting-Repositories — für Tests.

import type { DefectPoint, LeadTimePoint, OnTimePoint } from "@texma/shared";
import type { ProductionReportingRepository } from "../modules/production-reporting/production-reporting.service.js";

export class InMemoryProductionReportingRepository implements ProductionReportingRepository {
  constructor(
    private readonly leadTimes: LeadTimePoint[] = [],
    private readonly defects: DefectPoint[] = [],
    private readonly onTimes: OnTimePoint[] = []
  ) {}

  async leadTimePoints(): Promise<LeadTimePoint[]> {
    return this.leadTimes;
  }

  async defectPoints(): Promise<DefectPoint[]> {
    return this.defects;
  }

  async onTimePoints(): Promise<OnTimePoint[]> {
    return this.onTimes;
  }
}
