// In-Memory-Implementierung des Ampel-Repositories — für Tests/Durchstiche.

import type { TrackedProcess } from "@texma/shared";
import type { AmpelRepository } from "../modules/ampel/ampel.service.js";

export class InMemoryAmpelRepository implements AmpelRepository {
  constructor(private readonly processes: TrackedProcess[]) {}

  async trackedProcesses(): Promise<TrackedProcess[]> {
    return this.processes;
  }
}
