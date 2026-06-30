import { describe, expect, it } from "vitest";
import { FinApiRestClient, mapFinApiTransaction } from "./finapi-client.js";
import type { FetchLike } from "./types.js";

const secrets = { getSecret: async () => "s3cr3t" };

/** Stub-fetch: liefert je URL-Muster eine vordefinierte Antwort, protokolliert Aufrufe. */
function stubFetch(routes: Array<{ match: RegExp; status?: number; body: string }>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const r = routes.find((x) => x.match.test(url));
    const status = r?.status ?? (r ? 200 : 404);
    return { ok: status < 400, status, text: async () => r?.body ?? "", json: async () => JSON.parse(r?.body ?? "{}") };
  };
  return { fetch, calls };
}

describe("mapFinApiTransaction", () => {
  it("nimmt nur Gutschriften (>0) und rechnet auf Cent", () => {
    expect(mapFinApiTransaction({ id: 7, amount: 119.0, purpose: "RE-2026-001", bankBookingDate: "2026-06-01" }))
      .toMatchObject({ externalRef: "7", reference: "RE-2026-001", amountCents: 11900 });
  });
  it("verwirft Abgänge (≤0)", () => {
    expect(mapFinApiTransaction({ id: 8, amount: -50 })).toBeNull();
  });
});

describe("FinApiRestClient", () => {
  it("holt ein Token und ruft Transaktionen ab (PSD2)", async () => {
    const { fetch, calls } = stubFetch([
      { match: /oauth\/token$/, body: JSON.stringify({ access_token: "tok-1" }) },
      { match: /\/transactions\?/, body: JSON.stringify({ transactions: [{ id: 1, amount: 50, purpose: "RE-9" }] }) },
    ]);
    const client = new FinApiRestClient({ baseUrl: "https://api.test", clientId: "cid", clientSecretRef: "vault://finapi" }, secrets, fetch);
    const credits = await client.fetchTransactions({ id: "acc-1", name: "n", kind: "PSD2", iban: "DE", debtorName: "d" });
    expect(credits).toEqual([{ externalRef: "1", reference: "RE-9", amountCents: 5000 }]);
    expect(calls.some((u) => u.includes("oauth/token"))).toBe(true);
    expect(calls.some((u) => u.includes("/transactions?"))).toBe(true);
  });

  it("lädt CAMT.053 als XML (EBICS)", async () => {
    const { fetch } = stubFetch([
      { match: /oauth\/token$/, body: JSON.stringify({ access_token: "t" }) },
      { match: /camt53$/, body: "<Document>…</Document>" },
    ]);
    const client = new FinApiRestClient({ baseUrl: "https://api.test", clientId: "c", clientSecretRef: "v" }, secrets, fetch);
    const xml = await client.downloadCamt053({ id: "acc-2", name: "n", kind: "EBICS", iban: "DE", debtorName: "d" });
    expect(xml).toContain("<Document>");
  });

  it("reicht pain.001 ein und meldet Annahme", async () => {
    const { fetch } = stubFetch([
      { match: /oauth\/token$/, body: JSON.stringify({ access_token: "t" }) },
      { match: /paymentOrders$/, status: 201, body: JSON.stringify({ id: 555, status: "ACCEPTED" }) },
    ]);
    const client = new FinApiRestClient({ baseUrl: "https://api.test", clientId: "c", clientSecretRef: "v" }, secrets, fetch);
    const res = await client.submitPain001({ id: "acc-3", name: "n", kind: "EBICS", iban: "DE", debtorName: "d" }, "<pain.001/>");
    expect(res).toMatchObject({ providerRef: "555", accepted: true, message: "ACCEPTED" });
  });
});
