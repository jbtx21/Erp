import { describe, expect, it } from "vitest";
import { mapPaypalApiTxn, PaypalRestClient } from "./paypal-client.js";
import type { FetchLike } from "./types.js";

const secrets = { getSecret: async () => "pp-secret" };

describe("mapPaypalApiTxn", () => {
  it("mappt einen Transactions-API-Datensatz auf PaypalTxn", () => {
    const txn = mapPaypalApiTxn({
      transaction_info: {
        transaction_id: "PP-1", transaction_status: "S",
        transaction_amount: { value: "119.00", currency_code: "EUR" },
        fee_amount: { value: "-3.48", currency_code: "EUR" },
        invoice_id: "RE-2026-001", transaction_initiation_date: "2026-06-01T10:00:00+0000",
      },
      payer_info: { payer_name: { alternate_full_name: "Farverig ApS" } },
    });
    expect(txn).toMatchObject({
      transactionId: "PP-1", grossCents: 11900, feeCents: -348, currency: "EUR",
      status: "Abgeschlossen", payerName: "Farverig ApS", invoiceNumber: "RE-2026-001",
    });
  });
});

describe("PaypalRestClient", () => {
  it("holt ein Token (Basic-Auth) und liefert nur echte Gutschriften", async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push(url);
      if (/oauth2\/token$/.test(url)) {
        expect(init?.headers?.authorization).toMatch(/^Basic /);
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "tok" }), json: async () => ({}) };
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          transaction_details: [
            { transaction_info: { transaction_id: "PP-1", transaction_status: "S", transaction_amount: { value: "50.00", currency_code: "EUR" }, invoice_id: "RE-9" } },
            { transaction_info: { transaction_id: "PP-R", transaction_status: "S", transaction_amount: { value: "-10.00", currency_code: "EUR" } } }, // Rückzahlung → raus
          ],
        }),
        json: async () => ({}),
      };
    };
    const client = new PaypalRestClient({ baseUrl: "https://api-m.test", clientId: "cid", clientSecretRef: "vault://pp" }, secrets, fetch);
    const credits = await client.fetchCredits("2026-06-01T00:00:00Z", "2026-06-30T23:59:59Z");
    expect(credits).toEqual([{ externalRef: "PP-1", reference: "RE-9", amountCents: 5000, feeCents: 0, currency: "EUR" }]);
    expect(calls.some((u) => u.includes("oauth2/token"))).toBe(true);
    expect(calls.some((u) => u.includes("/reporting/transactions"))).toBe(true);
  });
});
