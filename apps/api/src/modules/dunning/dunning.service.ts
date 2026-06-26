// Anwendungsfall: Mahnlauf (Kap. 9.5 / T-14). Bindet die reine `computeDunning`-Logik
// (@texma/shared) an die offenen Posten und schreibt die erhöhte Mahnstufe fort. Die
// Mahnsperre (am Kunden) verhindert jede Mahnung des Postens. Repository als Interface
// → testbar ohne DB.

import {
  buildDunningNotice,
  computeDunning,
  DEFAULT_DUNNING,
  type DunnableItem,
  type DunningNoticeDraft,
  type DunningRun,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface DunningRepository {
  /** Offene Posten (> 0) inkl. Fälligkeit, aktueller Mahnstufe und Mahnsperre. */
  listDunnable(): Promise<DunnableItem[]>;
  /** Hebt die Mahnstufe an UND schreibt den Mahnbeleg (Historie) — atomar (G2).
   *  @returns die ID des erzeugten Mahnbelegs (null, wenn der Optimistik-Guard übersprang). */
  applyDunningStep(notice: DunningNoticeDraft): Promise<{ noticeId: string | null }>;
}

/** Mahnlauf-Ergebnis inkl. der erzeugten Mahnbeleg-IDs (für die GoBD-Auto-Archivierung). */
export interface DunningRunResult extends DunningRun {
  noticeIds: string[];
}

export class DunningService {
  constructor(
    private readonly repo: DunningRepository,
    private readonly audit: AuditSink
  ) {}

  /** Führt den Mahnlauf aus: je überfälligem, nicht gesperrtem Posten +1 Stufe. */
  async runDunning(today: Date = new Date()): Promise<DunningRunResult> {
    const items = await this.repo.listDunnable();
    const run = computeDunning(items, today, DEFAULT_DUNNING);

    const noticeIds: string[] = [];
    for (const p of run.proposals) {
      const { noticeId } = await this.repo.applyDunningStep(buildDunningNotice(p));
      if (noticeId) noticeIds.push(noticeId);
    }

    await this.audit.append(
      buildEntry({
        entity: "OpenItem",
        entityId: "dunning.run",
        action: "UPDATE",
        after: { gemahnt: run.proposals.length, gesperrt: run.blocked.length },
      })
    );

    return { ...run, noticeIds };
  }
}
