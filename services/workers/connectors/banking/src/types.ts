// Banking-Connector (Kap. 9 / 13 / 32): die ECHTEN Adapter (finAPI-REST, PayPal-REST) als
// separat deploybarer Worker — ein hängender Bankserver blockiert nie die Office-UI.
// Die Verträge spiegeln strukturell `FinApiClient`/`BankConnectionInfo` aus @texma/api
// (bewusst lokal, damit der Connector unabhängig von der App-Schicht baubar bleibt).

/** Verbindungsdaten (aus der DB; Secrets bewusst NICHT hier — die kommen aus dem Vault). */
export interface BankConnectionInfo {
  id: string;
  name: string;
  kind: "EBICS" | "PSD2";
  iban: string;
  bic?: string | null;
  debtorName: string;
  consentValidUntil?: Date | null;
}

/** Normalisierte Bank-Gutschrift, gespeist in die Matching-Pipeline (T-13). */
export interface NormalizedCredit {
  externalRef: string;
  reference: string;
  amountCents: number;
  bookedAt?: Date;
}

/** Ergebnis einer Zahlungseinreichung (pain.001). */
export interface SubmitResult {
  providerRef: string;
  accepted: boolean;
  message?: string;
}

/** Low-Level-Boundary zum Bank-Backend (deckungsgleich mit @texma/api FinApiClient). */
export interface FinApiClient {
  downloadCamt053(conn: BankConnectionInfo): Promise<string>;
  fetchTransactions(conn: BankConnectionInfo): Promise<NormalizedCredit[]>;
  submitPain001(conn: BankConnectionInfo, pain001Xml: string): Promise<SubmitResult>;
}

/**
 * Secret-Bezug zur Laufzeit aus dem Vault (Key-Vault-Port, ADR-0002). Geheimnisse
 * (finAPI-Client-Secret, PayPal-Client-Secret, EBICS-Passphrase) landen NIE in der DB
 * oder am BankConnection-Modell — sie werden je Abruf referenziert.
 */
export interface SecretsPort {
  getSecret(ref: string): Promise<string>;
}

/** Minimaler fetch-Vertrag (injizierbar → in Tests ohne Netzwerk stubbar). */
export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

/** HTTP-Fehler mit Status (für Retry-Entscheidungen). */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/** 5xx und 429 sind transient → Retry sinnvoll; 4xx (außer 429) nicht. */
export function isTransient(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}
