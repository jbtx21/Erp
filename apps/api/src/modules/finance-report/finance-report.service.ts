// Finanz-Reporting (B19, Kap. 29). Bindet die reine Aggregation (@texma/shared) an
// die offenen Posten. Auswertung, KEINE Buchung (G1). RBAC: die Geldfelder dieses
// Service sind nur für BÜRO/BUCHHALTUNG/ADMIN sichtbar — durchgesetzt in der API-
// Schicht (tRPC-Guard), nicht hier in der Aggregation.

import { dso, opAging, type AgingItem, type AgingReport } from "@texma/shared";

export interface FinanceReportRepository {
  /** Alle offenen Posten (> 0) mit Restbetrag und Fälligkeit. */
  listOpenItems(): Promise<AgingItem[]>;
  /** Summe der finalisierten Umsätze (netto) im Zeitraum [from, to). */
  revenueNetCents(from: Date, to: Date): Promise<number>;
}

export interface AgingWithDso extends AgingReport {
  dsoDays: number;
}

export class FinanceReportService {
  constructor(private readonly repo: FinanceReportRepository) {}

  /** OP-Aging zum Stichtag. */
  async agingReport(asOf: Date = new Date()): Promise<AgingReport> {
    return opAging(await this.repo.listOpenItems(), asOf);
  }

  /** OP-Aging + DSO über den Referenzzeitraum (Tage zwischen from und asOf). */
  async agingWithDso(from: Date, asOf: Date = new Date()): Promise<AgingWithDso> {
    const items = await this.repo.listOpenItems();
    const aging = opAging(items, asOf);
    const revenue = await this.repo.revenueNetCents(from, asOf);
    const periodDays = Math.max(1, Math.round((asOf.getTime() - from.getTime()) / 86_400_000));
    return { ...aging, dsoDays: dso(aging.total, revenue, periodDays) };
  }
}
