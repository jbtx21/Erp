// Rückwärtsterminierung eines Auftrags (B9, Kap. 35.2). Bindet die reine
// scheduling-Logik (@texma/shared) an den zugesagten Liefertermin und die
// Durchlaufzeiten der konfigurierten Veredelungsstufen (FinishingTargetTime).

import {
  backwardStart,
  scheduleBackward,
  type LeadStage,
  type ScheduledStage,
} from "@texma/shared";

export interface SchedulingInput {
  deliveryDate: Date;
  stages: LeadStage[];
}

export interface OrderSchedule {
  orderId: string;
  deliveryDate: Date;
  /** Spätester Starttermin, ab dem die Produktion beginnen muss. */
  start: Date;
  stages: ScheduledStage[];
}

export interface SchedulingRepository {
  /** Liefertermin + sequenzielle Lead-Stufen eines Auftrags; null, wenn kein Termin. */
  loadSchedulingInput(orderId: string): Promise<SchedulingInput | null>;
}

export class SchedulingService {
  constructor(private readonly repo: SchedulingRepository) {}

  /** Plant den Auftrag rückwärts vom Liefertermin; null ohne zugesagten Termin. */
  async planOrder(orderId: string): Promise<OrderSchedule | null> {
    const input = await this.repo.loadSchedulingInput(orderId);
    if (!input) return null;
    return {
      orderId,
      deliveryDate: input.deliveryDate,
      start: backwardStart(input.deliveryDate, input.stages),
      stages: scheduleBackward(input.deliveryDate, input.stages),
    };
  }
}
