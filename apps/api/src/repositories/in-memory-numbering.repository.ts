// In-Memory-Nummernkreis für Unit-Tests/Dev. Lückenlos je (key, year); nicht
// persistent. Der Produktionspfad ist PrismaNumberingRepository.

import type { SequenceKey } from "@texma/shared";
import type { NumberingRepository } from "../modules/numbering/numbering.service.js";

export class InMemoryNumberingRepository implements NumberingRepository {
  private readonly counters = new Map<string, number>();

  async nextSeq(key: SequenceKey, year: number): Promise<number> {
    const k = `${key}:${year}`;
    const next = (this.counters.get(k) ?? 0) + 1;
    this.counters.set(k, next);
    return next;
  }
}
