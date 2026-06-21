// Prisma-Implementierung der Kasse (Produktionspfad, B6). CashSale wird nur
// angelegt (append-only/WORM), nie aktualisiert.

import { prisma } from "@texma/db";
import type { CashSalePersistInput, PosRepository } from "../modules/pos/pos.service.js";

export class PrismaPosRepository implements PosRepository {
  async createSale(input: CashSalePersistInput): Promise<{ id: string }> {
    return prisma.cashSale.create({
      data: {
        belegNr: input.belegNr,
        registerId: input.registerId ?? null,
        orderId: input.orderId ?? null,
        betragCents: input.betragCents,
        art: input.art,
        kassiertAm: input.kassiertAm,
        kassierer: input.kassierer,
        tseSignatur: input.tse.signatur,
        tseSeriennummer: input.tse.seriennummer,
        tseTxId: input.tse.txId,
      },
      select: { id: true },
    });
  }
}
