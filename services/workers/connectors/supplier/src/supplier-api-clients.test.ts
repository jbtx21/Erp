import { describe, expect, it, vi } from "vitest";
import { IdIdentityFeedClient } from "./id-identity-client.js";
import { StanleyStellaClient } from "./stanleystella-client.js";

describe("IdIdentityFeedClient (C3)", () => {
  it("lädt den Vollfeed und gibt die Produktliste zurück", async () => {
    const feed = [{ ProductFields: { ItemId: "0300-001-007", EAN13Code: "5709245283029" }, StockLevel: 5, Prices: { Price: { Price: "9.90" } } }];
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(feed), { status: 200 }));
    const client = new IdIdentityFeedClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const { items, nextCursor } = await client.fetchCatalogSince(null);
    expect(items).toHaveLength(1);
    expect(nextCursor).toBe("full");
    expect(fetchImpl.mock.calls[0]![0]).toContain("id.dk");
  });

  it("akzeptiert auch ein Objekt mit Products-Liste", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Products: [{ a: 1 }, { a: 2 }] }), { status: 200 }));
    const client = new IdIdentityFeedClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const { items } = await client.fetchCatalogSince(null);
    expect(items).toHaveLength(2);
  });

  it("wirft bei HTTP-Fehler", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const client = new IdIdentityFeedClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.fetchCatalogSince(null)).rejects.toThrow(/HTTP 500/);
  });
});

describe("StanleyStellaClient (C3)", () => {
  const opts = (fetchImpl: typeof fetch) => ({ user: "u@texma.de", password: "secret", fetchImpl, timeoutMs: 1000 });

  it("baut die JSON-RPC-Payload mit db_name/user/password und parst result-String", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: "0", result: JSON.stringify([{ B2BSKUREF: "X1" }]) }), { status: 200 }));
    const client = new StanleyStellaClient(opts(fetchImpl as unknown as typeof fetch));
    const rows = await client.call("/webrequest/products/get_json", { Published: true });
    expect(rows).toEqual([{ B2BSKUREF: "X1" }]);
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ jsonrpc: "2.0", method: "call" });
    expect(body.params).toMatchObject({ db_name: "production_api", user: "u@texma.de", password: "secret", Published: true });
  });

  it("wirft, wenn die Antwort einen error-Node enthält (HTTP 200)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: "0", error: { message: "Odoo Server Error" } }), { status: 200 }));
    const client = new StanleyStellaClient(opts(fetchImpl as unknown as typeof fetch));
    await expect(client.call("/webrequest/products/get_json", {})).rejects.toThrow(/Odoo Server Error/);
  });

  it("führt Produkt + Preis + Stock zu einem Roh-Item je Variante zusammen", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: JSON.stringify([{ B2BSKUREF: "X1", EAN: "400001" }]) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: JSON.stringify([{ B2BSKUREF: "X1", Price: "4.25" }]) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: JSON.stringify([{ SKU: "X1", StockLevel: 1500 }]) }), { status: 200 }));
    const client = new StanleyStellaClient(opts(fetchImpl as unknown as typeof fetch));
    const { items } = await client.fetchCatalogSince(null);
    expect(items[0]).toMatchObject({ B2BSKUREF: "X1", EAN: "400001", ekEur: "4.25", stockQty: 1500 });
  });
});
