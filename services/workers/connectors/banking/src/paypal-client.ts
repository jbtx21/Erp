// PayPal-REST-Adapter (Kap. 9.4): Transactions/Reporting-API → PaypalTxn → über die
// quellen-agnostische Pipeline (paypalCredits) in den OP-Abgleich. Brutto klärt den OP,
// die Gebühr wird separat geführt, Fremdwährung mitgeführt. OAuth2 Client-Credentials;
// Client-Secret aus dem Vault (SecretsPort), nie aus der DB.

import { paypalCredits, type PaypalCredit, type PaypalTxn } from "@texma/shared";
import { httpRequest } from "./http.js";
import type { FetchLike, SecretsPort } from "./types.js";

export interface PaypalConfig {
  /** PayPal-REST-Basis (https://api-m.sandbox.paypal.com bzw. https://api-m.paypal.com). */
  baseUrl: string;
  clientId: string;
  /** Vault-Referenz des Client-Secrets. */
  clientSecretRef: string;
}

interface PaypalApiAmount { value?: string; currency_code?: string }
interface PaypalApiTxnInfo {
  transaction_id?: string;
  transaction_status?: string;
  transaction_amount?: PaypalApiAmount;
  fee_amount?: PaypalApiAmount;
  transaction_initiation_date?: string;
  invoice_id?: string;
  transaction_note?: string;
  transaction_subject?: string;
}
interface PaypalApiPayer { payer_name?: { alternate_full_name?: string } }
interface PaypalApiDetail { transaction_info?: PaypalApiTxnInfo; payer_info?: PaypalApiPayer }

/** Mappt einen PayPal-Transactions-API-Datensatz auf den shared `PaypalTxn`. */
export function mapPaypalApiTxn(d: PaypalApiDetail): PaypalTxn {
  const ti = d.transaction_info ?? {};
  const gross = Number(ti.transaction_amount?.value ?? "0");
  const fee = Number(ti.fee_amount?.value ?? "0");
  const reference = ti.invoice_id ?? ti.transaction_note ?? ti.transaction_subject ?? "";
  return {
    transactionId: ti.transaction_id ?? "",
    grossCents: Math.round((Number.isFinite(gross) ? gross : 0) * 100),
    feeCents: Math.round((Number.isFinite(fee) ? fee : 0) * 100),
    currency: ti.transaction_amount?.currency_code ?? "EUR",
    ...(ti.transaction_status ? { status: ti.transaction_status === "S" ? "Abgeschlossen" : ti.transaction_status } : {}),
    ...(d.payer_info?.payer_name?.alternate_full_name ? { payerName: d.payer_info.payer_name.alternate_full_name } : {}),
    ...(reference ? { invoiceNumber: reference } : {}),
    ...(ti.transaction_initiation_date ? { bookedAt: ti.transaction_initiation_date } : {}),
  };
}

export class PaypalRestClient {
  constructor(
    private readonly cfg: PaypalConfig,
    private readonly secrets: SecretsPort,
    private readonly fetchImpl: FetchLike
  ) {}

  /** OAuth2 Client-Credentials (Basic-Auth) → Access-Token. */
  async token(): Promise<string> {
    const secret = await this.secrets.getSecret(this.cfg.clientSecretRef);
    const basic = Buffer.from(`${this.cfg.clientId}:${secret}`).toString("base64");
    const { text } = await httpRequest(this.fetchImpl, `${this.cfg.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const json = JSON.parse(text) as { access_token?: string };
    if (!json.access_token) throw new Error("PayPal: kein access_token erhalten.");
    return json.access_token;
  }

  /** Liest die abgeschlossenen Transaktionen im Zeitraum [startIso, endIso] (ISO-8601). */
  async fetchTransactions(startIso: string, endIso: string): Promise<PaypalTxn[]> {
    const token = await this.token();
    const url = `${this.cfg.baseUrl}/v1/reporting/transactions?start_date=${encodeURIComponent(startIso)}&end_date=${encodeURIComponent(endIso)}&fields=transaction_info,payer_info`;
    const { text } = await httpRequest(this.fetchImpl, url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const json = (text ? JSON.parse(text) : {}) as { transaction_details?: PaypalApiDetail[] };
    return (json.transaction_details ?? []).map(mapPaypalApiTxn);
  }

  /** Bequemer Einstieg: Zeitraum → normalisierte Gutschriften (nur echte Eingänge). */
  async fetchCredits(startIso: string, endIso: string): Promise<PaypalCredit[]> {
    return paypalCredits(await this.fetchTransactions(startIso, endIso));
  }
}
