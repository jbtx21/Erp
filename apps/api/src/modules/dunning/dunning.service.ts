// Anwendungsfall: Mahnlauf (Kap. 9.5 / T-14). Bindet die reine `computeDunning`-Logik
// (@texma/shared) an die offenen Posten und schreibt die erhöhte Mahnstufe fort. Die
// Mahnsperre (am Kunden) verhindert jede Mahnung des Postens. Repository als Interface
// → testbar ohne DB.

import { computeDunning, DEFAULT_DUNNING, type DunnableItem, type DunningRun } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface DunningRepository {
  /** Offene Posten (> 0) inkl. Fälligkeit, aktueller Mahnstufe und Mahnsperre. */
  listDunnable(): Promise<DunnableItem[]>;
  /** Hebt die Mahnstufe eines Postens auf `toLevel`. */
  applyDunningLevel(itemId: string, toLevel: number): Promise<void>;
}

export class DunningService {
  constructor(
    private readonly repo: DunningRepository,
    private readonly audit: AuditSink
  ) {}

  /** Führt den Mahnlauf aus: je überfälligem, nicht gesperrtem Posten +1 Stufe. */
  async runDunning(today: Date = new Date()): Promise<DunningRun> {
    const items = await this.repo.listDunnable();
    const run = computeDunning(items, today, DEFAULT_DUNNING);

    for (const p of run.proposals) {
      await this.repo.applyDunningLevel(p.itemId, p.toLevel);
    }

    await this.audit.append(
      buildEntry({
        entity: "OpenItem",
        entityId: "dunning.run",
        action: "UPDATE",
        after: { gemahnt: run.proposals.length, gesperrt: run.blocked.length },
      })
    );

    return run;
  }
}
