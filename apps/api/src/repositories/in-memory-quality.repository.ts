// In-Memory-QS-Repository für Unit-Tests/Dev.

import type { QualityCheck, QualityRepository, QualityStatus } from "../modules/quality/quality.service.js";

export class InMemoryQualityRepository implements QualityRepository {
  private readonly orders = new Map<string, QualityCheck>();

  /** Auftrag für QS registrieren (Testfixture). */
  seed(orderId: string): void {
    this.orders.set(orderId, { orderId, status: "OFFEN", stueckzahlOk: false, veredelungOk: false, fotoOk: false, notiz: null, geprueftAm: null });
  }

  async get(orderId: string): Promise<QualityCheck | null> {
    return this.orders.get(orderId) ?? null;
  }

  async update(orderId: string, data: { stueckzahlOk: boolean; veredelungOk: boolean; fotoOk: boolean; notiz: string | null; status: QualityStatus; geprueftAm: Date | null }): Promise<boolean> {
    const cur = this.orders.get(orderId);
    if (!cur) return false;
    this.orders.set(orderId, { orderId, ...data });
    return true;
  }
}
