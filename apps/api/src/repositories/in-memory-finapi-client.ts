// In-Memory-FinApiClient (Demo/Tests): liefert vordefinierte Auszüge je Verbindung und
// protokolliert eingereichte pain.001-Zahlungen. Ersetzt den echten finAPI-/EBICS-Client.

import type {
  BankConnectionInfo,
  FinApiClient,
  NormalizedCredit,
  SubmitResult,
} from "../modules/banking/bank-connection.provider.js";

/** Baut ein minimales, parsebares CAMT.053-XML aus normalisierten Gutschriften. */
export function creditsToCamt053(credits: ReadonlyArray<NormalizedCredit>): string {
  const ntries = credits
    .map(
      (c) =>
        `<Ntry><Amt Ccy="EUR">${(c.amountCents / 100).toFixed(2)}</Amt><CdtDbtInd>CRDT</CdtDbtInd>` +
        `<NtryDtls><TxDtls><Refs><AcctSvcrRef>${c.externalRef}</AcctSvcrRef></Refs>` +
        `<RmtInf><Ustrd>${c.reference}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Document><BkToCstmrStmt><Stmt>${ntries}</Stmt></BkToCstmrStmt></Document>`;
}

export interface InMemoryFinApiSeed {
  /** Gutschriften je Verbindungs-ID (EBICS wird daraus CAMT.053, PSD2 direkt geliefert). */
  creditsByConnection?: Record<string, NormalizedCredit[]>;
}

export interface RecordedSubmission {
  connectionId: string;
  pain001Xml: string;
  providerRef: string;
}

export class InMemoryFinApiClient implements FinApiClient {
  private readonly credits: Map<string, NormalizedCredit[]>;
  readonly submissions: RecordedSubmission[] = [];
  private seq = 0;

  constructor(seed: InMemoryFinApiSeed = {}) {
    this.credits = new Map(Object.entries(seed.creditsByConnection ?? {}).map(([k, v]) => [k, [...v]]));
  }

  async downloadCamt053(conn: BankConnectionInfo): Promise<string> {
    return creditsToCamt053(this.credits.get(conn.id) ?? []);
  }

  async fetchTransactions(conn: BankConnectionInfo): Promise<NormalizedCredit[]> {
    return (this.credits.get(conn.id) ?? []).map((c) => ({ ...c }));
  }

  async submitPain001(conn: BankConnectionInfo, pain001Xml: string): Promise<SubmitResult> {
    const providerRef = `FINAPI-${conn.kind}-${++this.seq}`;
    this.submissions.push({ connectionId: conn.id, pain001Xml, providerRef });
    return { providerRef, accepted: true, message: "Zur Ausführung angenommen." };
  }
}
