// Kasse / POS (B6, Kap. 37.4). Jeder Barverkauf wird von der TSE signiert
// (KassenSichV/§146a AO), bekommt eine BON-Nummer (F1) und wird append-only/WORM
// festgehalten. Die TSE liegt hinter einem Port (TseConnector) — im Betrieb Deutsche
// Fiskal, im Test ein Stub. Verknüpfung mit Auftrag/Zahlung optional.

import { isTseSigned, type CashSaleRecord, type PaymentArt } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import { NumberingService } from "../numbering/numbering.service.js";

export interface TseTransaction {
  signatur: string;
  seriennummer: string;
  txId: string;
}

/** Port zur TSE (Deutsche Fiskal) — kapselt Signatur/Transaktion. */
export interface TseConnector {
  signSale(input: { betragCents: number; art: PaymentArt; belegNr: string }): Promise<TseTransaction>;
}

export interface RecordSaleInput {
  betragCents: number;
  art: PaymentArt;
  kassierer: string;
  registerId?: string | null;
  orderId?: string | null;
}

export interface CashSalePersistInput extends RecordSaleInput {
  belegNr: string;
  kassiertAm: Date;
  tse: TseTransaction;
}

export interface PosRepository {
  createSale(input: CashSalePersistInput): Promise<{ id: string }>;
}

export class PosService {
  constructor(
    private readonly repo: PosRepository,
    private readonly tse: TseConnector,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  /** Verbucht einen Barverkauf: TSE-Signatur → BON-Nummer → unveränderbarer Beleg. */
  async recordSale(input: RecordSaleInput, at: Date = new Date()): Promise<{ id: string; belegNr: string; tse: TseTransaction }> {
    if (!Number.isInteger(input.betragCents) || input.betragCents <= 0) {
      throw new Error("betragCents must be a positive integer");
    }
    const belegNr = await this.numbering.next("CASH_RECEIPT", at);
    const tse = await this.tse.signSale({ betragCents: input.betragCents, art: input.art, belegNr });

    const record: CashSaleRecord = {
      belegNr,
      betragCents: input.betragCents,
      art: input.art,
      kassiertAm: at,
      kassierer: input.kassierer,
      tseSignatur: tse.signatur,
      tseSeriennummer: tse.seriennummer,
      tseTxId: tse.txId,
    };
    if (!isTseSigned(record)) {
      throw new Error("TSE-Signatur unvollständig — Verkauf nicht KassenSichV-konform");
    }

    const { id } = await this.repo.createSale({ ...input, belegNr, kassiertAm: at, tse });
    await this.audit.append(
      buildEntry({
        entity: "CashSale",
        entityId: id,
        action: "CREATE",
        after: { belegNr, betragCents: input.betragCents, art: input.art, tseTxId: tse.txId },
      })
    );
    return { id, belegNr, tse };
  }
}

/**
 * Stub-TSE für Tests/Dev (deterministische Signatur). Der echte Deutsche-Fiskal-
 * Connector (services/workers/connectors/tse) implementiert denselben Port und ist
 * ein nicht-blockierender Begleitschritt (Vertrag/Keys).
 */
export class StubTseConnector implements TseConnector {
  private seq = 0;
  constructor(private readonly seriennummer = "TSE-STUB-0001") {}

  async signSale(input: { betragCents: number; art: PaymentArt; belegNr: string }): Promise<TseTransaction> {
    const txId = `tx-${++this.seq}`;
    const signatur = Buffer.from(`${input.belegNr}|${input.betragCents}|${input.art}|${txId}`).toString("base64");
    return { signatur, seriennummer: this.seriennummer, txId };
  }
}
