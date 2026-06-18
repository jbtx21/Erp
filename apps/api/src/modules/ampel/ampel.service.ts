// Anwendungsfall: ebenenübergreifende Terminübersicht / Ampel (Kap. 35.4). Bindet die
// reine `buildAmpelOverview`-Logik (@texma/shared) an die terminierten Vorgänge (Angebote
// mit Wiedervorlage, Produktionsaufträge mit Liefertermin). Ersetzt die Excel-Terminliste.
// Reine Lese-Analyse; Repository als Interface.

import { buildAmpelOverview, type AmpelRow, type TrackedProcess } from "@texma/shared";

export interface AmpelRepository {
  /** Alle terminierten Vorgänge (Angebot/Auftrag/Produktion/Veredler). */
  trackedProcesses(): Promise<TrackedProcess[]>;
}

export class AmpelService {
  constructor(private readonly repo: AmpelRepository) {}

  async overview(today: Date = new Date()): Promise<AmpelRow[]> {
    return buildAmpelOverview(await this.repo.trackedProcesses(), today);
  }
}
