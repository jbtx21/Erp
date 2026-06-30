// Anwendungsfall: Mahnlauf (Kap. 9.5 / T-14). Bindet die reine `computeDunning`-Logik
// (@texma/shared) an die offenen Posten und schreibt die erhöhte Mahnstufe fort. Die
// Mahnsperre (am Kunden) verhindert jede Mahnung des Postens. Repository als Interface
// → testbar ohne DB.

import {
  buildDunningNotice,
  computeDunning,
  daysOverdue,
  DEFAULT_DUNNING,
  type DunnableItem,
  type DunningNoticeDraft,
  type DunningRun,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

/** Offener Posten mit Anzeigefeldern für die Mahnlauf-Vorschau (Cockpit). */
export interface DunnableDetail extends DunnableItem {
  invoiceNumber: string;
  companyName: string;
  companyId?: string;
}

export interface DunningRepository {
  /** Offene Posten (> 0) inkl. Fälligkeit, aktueller Mahnstufe und Mahnsperre. */
  listDunnable(): Promise<DunnableItem[]>;
  /** Wie listDunnable, zusätzlich mit Rechnungs-/Debitor-Anzeigefeldern (Vorschau). */
  listDunnableDetailed(): Promise<DunnableDetail[]>;
  /** Hebt die Mahnstufe an UND schreibt den Mahnbeleg (Historie) — atomar (G2).
   *  @returns die ID des erzeugten Mahnbelegs (null, wenn der Optimistik-Guard übersprang). */
  applyDunningStep(notice: DunningNoticeDraft): Promise<{ noticeId: string | null }>;
}

/** Mahnlauf-Ergebnis inkl. der erzeugten Mahnbeleg-IDs (für die GoBD-Auto-Archivierung). */
export interface DunningRunResult extends DunningRun {
  noticeIds: string[];
}

/** Ein Mahnvorschlag mit Anzeigefeldern (für die Vorschau-Liste). */
export interface DunningProposalDetail {
  itemId: string;
  fromLevel: number;
  toLevel: number;
  daysOverdue: number;
  invoiceNumber: string;
  companyName: string;
  openCents: number;
  dueDate: Date;
  /** true = nicht gemahnt (Mahnsperre am Kunden) — sichtbar, aber nicht auswählbar. */
  blocked: boolean;
}

export interface DunningPreview {
  proposals: DunningProposalDetail[];
  blocked: DunningProposalDetail[];
}

export class DunningService {
  constructor(
    private readonly repo: DunningRepository,
    private readonly audit: AuditSink
  ) {}

  /**
   * Nebenwirkungsfreie Vorschau (Dry-Run): berechnet die Mahnvorschläge inkl. gesperrter
   * Posten mit Anzeigefeldern, OHNE die Mahnstufe fortzuschreiben. Grundlage des Cockpits
   * (Vorab-Prüfen → selektiv ausführen).
   */
  async previewDunning(today: Date = new Date()): Promise<DunningPreview> {
    const items = await this.repo.listDunnableDetailed();
    const run = computeDunning(items, today, DEFAULT_DUNNING);
    const byId = new Map(items.map((i) => [i.id, i]));

    const toDetail = (itemId: string, fromLevel: number, toLevel: number, blocked: boolean): DunningProposalDetail => {
      const it = byId.get(itemId);
      return {
        itemId, fromLevel, toLevel, blocked,
        daysOverdue: it ? daysOverdue(it.dueDate, today) : 0,
        invoiceNumber: it?.invoiceNumber ?? itemId,
        companyName: it?.companyName ?? "—",
        openCents: it?.openCents ?? 0,
        dueDate: it?.dueDate ?? today,
      };
    };

    const proposals = run.proposals.map((p) => toDetail(p.itemId, p.fromLevel, p.toLevel, false));
    // Gesperrte: Zielstufe = aktuelle + 1 (Anzeige), aber blockiert.
    const blocked = run.blocked.map((id) => {
      const it = byId.get(id);
      const from = it?.dunningLevel ?? 0;
      return toDetail(id, from, from + 1, true);
    });
    return { proposals, blocked };
  }

  /**
   * Führt den Mahnlauf aus: je überfälligem, nicht gesperrtem Posten +1 Stufe.
   * Mit `onlyItemIds` selektiv — nur die markierten Posten werden gemahnt (Cockpit-Freigabe).
   */
  async runDunning(today: Date = new Date(), opts?: { onlyItemIds?: string[] }): Promise<DunningRunResult> {
    const items = await this.repo.listDunnable();
    const run = computeDunning(items, today, DEFAULT_DUNNING);

    const only = opts?.onlyItemIds && opts.onlyItemIds.length > 0 ? new Set(opts.onlyItemIds) : null;
    const proposals = only ? run.proposals.filter((p) => only.has(p.itemId)) : run.proposals;

    const noticeIds: string[] = [];
    for (const p of proposals) {
      const { noticeId } = await this.repo.applyDunningStep(buildDunningNotice(p));
      if (noticeId) noticeIds.push(noticeId);
    }

    await this.audit.append(
      buildEntry({
        entity: "OpenItem",
        entityId: "dunning.run",
        action: "UPDATE",
        after: { gemahnt: proposals.length, gesperrt: run.blocked.length, selektiv: only != null },
      })
    );

    return { proposals, blocked: run.blocked, noticeIds };
  }
}
