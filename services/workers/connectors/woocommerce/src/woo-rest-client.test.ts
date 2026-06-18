import { describe, expect, it, vi } from "vitest";
import { WooRestClient } from "./woo-rest-client.js";

function jsonResponse(body: unknown, totalPages: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-WP-TotalPages": String(totalPages) },
  });
}

const opts = (fetchImpl: typeof fetch) => ({
  baseUrl: "https://acme.example/",
  consumerKey: "ck_test",
  consumerSecret: "cs_test",
  fetchImpl,
});

describe("WooRestClient.fetchOrdersSince", () => {
  it("paginiert über X-WP-TotalPages und akkumuliert alle Orders", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 1, date_modified_gmt: "2026-06-18T08:00:00" }], 2))
      .mockResolvedValueOnce(jsonResponse([{ id: 2, date_modified_gmt: "2026-06-18T09:30:00" }], 2));

    const client = new WooRestClient(opts(fetchImpl as unknown as typeof fetch));
    const res = await client.fetchOrdersSince(null);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.orders).toHaveLength(2);
    expect(res.nextCursor).toBe("2026-06-18T09:30:00"); // max date_modified_gmt
  });

  it("setzt Basic-Auth-Header und modified_after aus dem Cursor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], 1));
    const client = new WooRestClient(opts(fetchImpl as unknown as typeof fetch));

    await client.fetchOrdersSince("2026-06-01T00:00:00");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/wp-json/wc/v3/orders");
    expect(url).toContain("modified_after=2026-06-01T00%3A00%3A00");
    expect(url).toContain("orderby=modified");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Basic " + Buffer.from("ck_test:cs_test").toString("base64"),
    });
  });

  it("ohne Orders bleibt der Cursor erhalten", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], 1));
    const client = new WooRestClient(opts(fetchImpl as unknown as typeof fetch));
    const res = await client.fetchOrdersSince("2026-06-01T00:00:00");
    expect(res.nextCursor).toBe("2026-06-01T00:00:00");
  });

  it("wirft bei 401 eine klare Auth-Fehlermeldung", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const client = new WooRestClient(opts(fetchImpl as unknown as typeof fetch));
    await expect(client.fetchOrdersSince(null)).rejects.toThrow(/Authentifizierung fehlgeschlagen/);
  });
});

describe("WooRestClient.updateOrderStatus (T-06/T-09)", () => {
  it("PUTtet Status + Tracking-Meta an die Bestellung", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const client = new WooRestClient(opts(fetchImpl as unknown as typeof fetch));

    await client.updateOrderStatus("500", "completed", "DPD123");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/wp-json/wc/v3/orders/500");
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.status).toBe("completed");
    expect(body.meta_data).toEqual([{ key: "_dpd_tracking", value: "DPD123" }]);
  });

  it("lässt das Tracking-Meta weg, wenn keine Trackingnummer vorliegt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const client = new WooRestClient(opts(fetchImpl as unknown as typeof fetch));
    await client.updateOrderStatus("500", "on-hold");
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.meta_data).toBeUndefined();
  });
});
