// Prisma-Implementierung der Mahnwesen-Repositories (Produktionspfad, T-14).
// Die Mahnsperre liegt am Kunden (Company.mahnsperre) und wird über Invoice → Company
// aufgelöst.

import { prisma } from "@texma/db";
import type { DunnableItem, DunningNoticeDraft } from "@texma/shared";
import type { DunningRepository } from "../modules/dunning/dunning.service.js";
import type { DunningOverviewItem, DunningQueryRepository } from "./read.js";

export class PrismaDunningRepository implements DunningRepository, DunningQueryRepository {
  private async load(): Promise<Array<DunnableItem & { invoiceNumber: string }>> {
    const rows = await prisma.openItem.findMany({
      where: { openCents: { gt: 0 } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        openCents: true,
        dueDate: true,
        dunningLevel: true,
        invoice: { select: { number: true, company: { select: { mahnsperre: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      openCents: r.openCents,
      dueDate: r.dueDate,
      dunningLevel: r.dunningLevel,
      mahnsperre: r.invoice.company.mahnsperre,
      invoiceNumber: r.invoice.number,
    }));
  }

  async listDunnable(): Promise<DunnableItem[]> {
    return this.load();
  }

  async applyDunningStep(notice: DunningNoticeDraft): Promise<void> {
    // Stufe hochsetzen und Mahnbeleg (Historie) atomar schreiben (G2: kein Update).
    // Optimistischer Guard auf die Ausgangsstufe: ein paralleler Mahnlauf, der den
    // Posten bereits erhöht hat, trifft 0 Zeilen -> kein zweiter Beleg derselben Stufe.
    await prisma.$transaction(async (tx) => {
      const advanced = await tx.openItem.updateMany({
        where: { id: notice.itemId, dunningLevel: notice.stufe - 1 },
        data: { dunningLevel: notice.stufe },
      });
      if (advanced.count === 0) return;
      await tx.dunningNotice.create({
        data: {
          openItemId: notice.itemId,
          stufe: notice.stufe,
          gebuehrCents: notice.gebuehrCents,
          textVorlage: notice.textVorlage,
        },
      });
    });
  }

  async listDunning(limit: number): Promise<DunningOverviewItem[]> {
    const rows = await this.load();
    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      openCents: r.openCents,
      dueDate: r.dueDate,
      dunningLevel: r.dunningLevel,
      mahnsperre: r.mahnsperre,
    }));
  }
}
