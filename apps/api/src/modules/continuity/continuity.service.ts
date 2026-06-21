// Notbetrieb & Resilienz (B17, K-17). Modus A: Offline-Bundle offener Aufträge
// (reine Zusammenstellung via @texma/shared). Wiederanlauf: nacherfasste
// Produktionsrückmeldungen werden idempotent verbucht — derselbe Idempotenzschlüssel
// (vom Offline-Gerät) erzeugt keine Doppelbuchung.

import {
  buildOfflineBundle,
  type OfflineBundle,
  type OfflineBundleOrder,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface ProductionFeedback {
  productionId: string;
  userId: string;
  minutes: number;
  note?: string | null;
  /** Idempotenzschlüssel des erfassenden (Offline-)Geräts. */
  idempotencyKey: string;
}

export interface ContinuityRepository {
  /** Basisdaten aller offenen Aufträge (nicht versendet/storniert) für das Bundle. */
  openBundleOrders(): Promise<OfflineBundleOrder[]>;
  /** Verbucht eine Rückmeldung idempotent: bei bekanntem Schlüssel passiert nichts. */
  recordFeedback(fb: ProductionFeedback): Promise<{ id: string; created: boolean }>;
}

export class ContinuityService {
  constructor(
    private readonly repo: ContinuityRepository,
    private readonly audit: AuditSink
  ) {}

  /** Tages-Offline-Bundle der offenen Aufträge (Modus A). */
  async offlineBundle(now: Date = new Date()): Promise<OfflineBundle> {
    return buildOfflineBundle(await this.repo.openBundleOrders(), now);
  }

  /** Nacherfassung einer Produktionsrückmeldung (idempotent, Wiederanlauf). */
  async recordFeedback(fb: ProductionFeedback): Promise<{ id: string; created: boolean }> {
    if (!fb.idempotencyKey) throw new Error("idempotencyKey required");
    if (!Number.isInteger(fb.minutes) || fb.minutes < 0) {
      throw new Error("minutes must be a non-negative integer");
    }
    const res = await this.repo.recordFeedback(fb);
    if (res.created) {
      await this.audit.append(
        buildEntry({
          entity: "TimeEntry",
          entityId: res.id,
          action: "CREATE",
          after: { productionId: fb.productionId, minutes: fb.minutes, idempotencyKey: fb.idempotencyKey },
        })
      );
    }
    return res;
  }
}
