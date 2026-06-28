// In-Memory-Implementierung der Mahnwesen-Repositories — für Tests/lokale Durchstiche.

import { daysOverdue as overdueDays, type DunnableItem, type DunningNoticeDraft } from "@texma/shared";
import type { DunningRepository } from "../modules/dunning/dunning.service.js";
import type { DunningOverviewItem, DunningQueryRepository } from "./read.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedOpenItem extends DunnableItem {
  invoiceNumber: string;
  /** Optionale Verknüpfungsdaten (Tests, die die Übersicht prüfen). */
  companyId?: string;
  companyName?: string;
  issuedAt?: Date;
  grossCents?: number;
}

export class InMemoryDunningRepository implements DunningRepository, DunningQueryRepository {
  /** Append-only Mahnhistorie (B10) — für Testzusicherungen einsehbar. */
  readonly notices: DunningNoticeDraft[] = [];

  constructor(private readonly items: SeedOpenItem[]) {}

  async listDunnable(): Promise<DunnableItem[]> {
    return this.items.map((i) => ({
      id: i.id,
      openCents: i.openCents,
      dueDate: i.dueDate,
      dunningLevel: i.dunningLevel,
      mahnsperre: i.mahnsperre,
    }));
  }

  private seq = 0;
  /** Jüngster erzeugter Mahnbeleg je Posten (für die Listen-PDF/Mail). */
  private readonly latestNotice = new Map<string, string>();
  async applyDunningStep(notice: DunningNoticeDraft): Promise<{ noticeId: string | null }> {
    const it = this.items.find((x) => x.id === notice.itemId);
    if (it) it.dunningLevel = notice.stufe;
    this.notices.push(notice);
    const noticeId = `dn_${++this.seq}`;
    this.latestNotice.set(notice.itemId, noticeId);
    return { noticeId };
  }

  async listDunning(limit: number): Promise<DunningOverviewItem[]> {
    const today = new Date();
    return this.items.slice(0, limit).map((i) => {
      const issuedAt = i.issuedAt ?? i.dueDate;
      return {
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        companyId: i.companyId ?? "",
        companyName: i.companyName ?? "—",
        issuedAt,
        zahlungszielTage: Math.round((i.dueDate.getTime() - issuedAt.getTime()) / DAY_MS),
        grossCents: i.grossCents ?? i.openCents,
        openCents: i.openCents,
        dueDate: i.dueDate,
        daysOverdue: overdueDays(i.dueDate, today),
        dunningLevel: i.dunningLevel,
        mahnsperre: i.mahnsperre,
        latestNoticeId: this.latestNotice.get(i.id) ?? null,
      };
    });
  }
}
