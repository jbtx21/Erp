// In-Memory-Scheduling-Repository für Unit-Tests/Dev.

import type {
  SchedulingInput,
  SchedulingRepository,
} from "../modules/scheduling/scheduling.service.js";

export class InMemorySchedulingRepository implements SchedulingRepository {
  private readonly inputs = new Map<string, SchedulingInput>();

  set(orderId: string, input: SchedulingInput): void {
    this.inputs.set(orderId, input);
  }

  async loadSchedulingInput(orderId: string): Promise<SchedulingInput | null> {
    return this.inputs.get(orderId) ?? null;
  }
}
