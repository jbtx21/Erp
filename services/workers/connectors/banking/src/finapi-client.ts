// finAPI-REST-Adapter (Kap. 9): produktive Implementierung des FinApiClient-Interfaces.
// OAuth2-Token (Client-Credentials) → Bankzugänge: CAMT.053 abrufen (AIS), Transaktionen
// lesen (PSD2), pain.001 einreichen (PIS). Secrets kommen aus dem Vault (SecretsPort),
// nie aus der DB. Der PSD2-Web-Form-Consent-Flow (90-Tage-SCA) wird über die finAPI-
// Web-Form angestoßen; der Status liegt am BankConnection (consentValidUntil).

import { getJson, httpRequest } from "./http.js";
import type { BankConnectionInfo, FetchLike, FinApiClient, NormalizedCredit, SecretsPort, SubmitResult } from "./types.js";

export interface FinApiConfig {
  /** finAPI-REST-Basis (z. B. https://sandbox.finapi.io oder Live). */
  baseUrl: string;
  clientId: string;
  /** Vault-Referenz des Client-Secrets (NICHT das Secret selbst). */
  clientSecretRef: string;
}

interface FinApiRawTxn {
  id?: number | string;
  // finAPI liefert Beträge als Float in der Kontowährung; + = Gutschrift.
  amount?: number;
  purpose?: string | null;
  counterpartName?: string | null;
  bankBookingDate?: string | null;
  valueDate?: string | null;
}

/** Mappt einen finAPI-Transaktionsdatensatz auf eine normalisierte Gutschrift (nur Eingänge). */
export function mapFinApiTransaction(t: FinApiRawTxn): NormalizedCredit | null {
  const amount = typeof t.amount === "number" ? t.amount : Number(t.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null; // nur Gutschriften (> 0)
  const ref = (t.purpose ?? t.counterpartName ?? "").trim();
  const dateStr = t.bankBookingDate ?? t.valueDate ?? null;
  const bookedAt = dateStr ? new Date(dateStr) : undefined;
  return {
    externalRef: String(t.id ?? `${dateStr ?? ""}-${Math.round(amount * 100)}`),
    reference: ref,
    amountCents: Math.round(amount * 100),
    ...(bookedAt && !Number.isNaN(bookedAt.getTime()) ? { bookedAt } : {}),
  };
}

export class FinApiRestClient implements FinApiClient {
  constructor(
    private readonly cfg: FinApiConfig,
    private readonly secrets: SecretsPort,
    private readonly fetchImpl: FetchLike
  ) {}

  /** OAuth2 Client-Credentials → Access-Token (je Aufruf frisch geholt; finAPI-Tokens sind kurzlebig). */
  async token(): Promise<string> {
    const secret = await this.secrets.getSecret(this.cfg.clientSecretRef);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.cfg.clientId,
      client_secret: secret,
    }).toString();
    const { text } = await httpRequest(this.fetchImpl, `${this.cfg.baseUrl}/api/v2/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = JSON.parse(text) as { access_token?: string };
    if (!json.access_token) throw new Error("finAPI: kein access_token erhalten.");
    return json.access_token;
  }

  /** EBICS C53 / AIS: CAMT.053-Auszug der Verbindung als XML. */
  async downloadCamt053(conn: BankConnectionInfo): Promise<string> {
    const token = await this.token();
    const { text } = await httpRequest(this.fetchImpl, `${this.cfg.baseUrl}/api/v2/bankConnections/${encodeURIComponent(conn.id)}/camt53`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/xml" },
    });
    return text;
  }

  /** PSD2 AIS: Transaktionen → normalisierte Gutschriften (nur Eingänge). */
  async fetchTransactions(conn: BankConnectionInfo): Promise<NormalizedCredit[]> {
    const token = await this.token();
    const json = (await getJson(this.fetchImpl, `${this.cfg.baseUrl}/api/v2/transactions?accountIds=${encodeURIComponent(conn.id)}&direction=income`, token)) as
      | { transactions?: FinApiRawTxn[] }
      | null;
    return (json?.transactions ?? []).map(mapFinApiTransaction).filter((c): c is NormalizedCredit => c != null);
  }

  /** EBICS CCT / PSD2 PIS: pain.001 einreichen → Provider-Referenz + Annahmestatus. */
  async submitPain001(conn: BankConnectionInfo, pain001Xml: string): Promise<SubmitResult> {
    const token = await this.token();
    const { status, text } = await httpRequest(this.fetchImpl, `${this.cfg.baseUrl}/api/v2/bankConnections/${encodeURIComponent(conn.id)}/paymentOrders`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/xml", accept: "application/json" },
      body: pain001Xml,
    });
    const json = (text ? JSON.parse(text) : {}) as { id?: string | number; status?: string };
    const accepted = status < 300 && json.status !== "REJECTED";
    return {
      providerRef: String(json.id ?? `finapi-${conn.id}`),
      accepted,
      ...(json.status ? { message: json.status } : {}),
    };
  }
}
