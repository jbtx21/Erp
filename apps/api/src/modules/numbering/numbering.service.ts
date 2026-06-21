// Vergabe lückenloser Belegnummern (GoBD, Kap. 10/19). Die reine Formatierung
// liegt in @texma/shared (numbering.ts); die atomare, lückenlose Reservierung der
// laufenden Nummer steckt im Repository (transaktional). Belegnummern werden erst
// bei der FINALISIERUNG eines Belegs vergeben — so entstehen keine Lücken durch
// verworfene Entwürfe.

import { formatSequenceNumber, type SequenceKey } from "@texma/shared";

export interface NumberingRepository {
  /**
   * Liefert atomar die nächste laufende Nummer für (key, year). Muss lückenlos
   * und kollisionsfrei sein, auch bei paralleler Vergabe (DB-Transaktion).
   */
  nextSeq(key: SequenceKey, year: number): Promise<number>;
}

export class NumberingService {
  constructor(private readonly repo: NumberingRepository) {}

  /**
   * Reserviert die nächste Belegnummer der Belegart (Format `<PREFIX>-<JAHR>-<NNNN>`).
   * `at` bestimmt das Jahr des Nummernkreises (Default: jetzt).
   */
  async next(key: SequenceKey, at: Date = new Date()): Promise<string> {
    const year = at.getUTCFullYear();
    const seq = await this.repo.nextSeq(key, year);
    return formatSequenceNumber(key, year, seq);
  }
}
