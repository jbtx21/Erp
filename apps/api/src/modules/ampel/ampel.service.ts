// Anwendungsfall: ebenenübergreifende Terminübersicht / Ampel (Kap. 35.4). Bindet die
// reine `buildAmpelOverview`-Logik (@texma/shared) an die terminierten Vorgänge (Angebote
// mit Wiedervorlage, Produktionsaufträge mit Liefertermin). Ersetzt die Excel-Terminliste.
// Reine Lese-Analyse; Repository als Interface.

import {
  buildAmpelOverview,
  summarizeAmpel,
  type AmpelRow,
  type AmpelSummary,
  type TrackedProcess,
} from "@texma/shared";

export interface AmpelRepository {
  /** Alle terminierten Vorgänge (Angebot/Auftrag/Produktion/Veredler). */
  trackedProcesses(): Promise<TrackedProcess[]>;
}

export class AmpelService {
  constructor(private readonly repo: AmpelRepository) {}

  async overview(today: Date = new Date()): Promise<AmpelRow[]> {
    return buildAmpelOverview(await this.repo.trackedProcesses(), today);
  }

  /** Dashboard-Verdichtung der Ampel (Zählungen je Status/Ebene, Eskalation). */
  async summary(today: Date = new Date()): Promise<AmpelSummary> {
    return summarizeAmpel(buildAmpelOverview(await this.repo.trackedProcesses(), today));
  }
}
