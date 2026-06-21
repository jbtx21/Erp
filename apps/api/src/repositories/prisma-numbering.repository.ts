// Prisma-Implementierung des Nummernkreises (Produktionspfad, GoBD Kap. 10/19).
// Atomare, lückenlose Vergabe über ein einziges UPSERT mit RETURNING: die erste
// Vergabe eines Jahres legt die Zeile mit next=1 an, jede weitere erhöht next um 1
// in derselben Anweisung. Dadurch ist die Vergabe race-frei (Row-Lock auf dem
// Konflikt) und ohne Lücken — auch bei paralleler Reservierung.

import { prisma } from "@texma/db";
import type { SequenceKey } from "@texma/shared";
import type { NumberingRepository } from "../modules/numbering/numbering.service.js";

export class PrismaNumberingRepository implements NumberingRepository {
  async nextSeq(key: SequenceKey, year: number): Promise<number> {
    const rows = await prisma.$queryRaw<{ next: number }[]>`
      INSERT INTO "NumberSequence" ("key", "year", "next")
      VALUES (${key}, ${year}, 1)
      ON CONFLICT ("key", "year")
      DO UPDATE SET "next" = "NumberSequence"."next" + 1
      RETURNING "next"
    `;
    return rows[0]!.next;
  }
}
