import { describe, expect, it, vi } from "vitest";
import { RestSupplierCatalogClient } from "./rest-client.js";

function jsonResponse(body: unknown, totalPages: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Total-Pages": String(totalPages) },
  });
}

const basicOpts = (fetchImpl: typeof fetch) => ({
  baseUrl: "https://id-identity.example/",
  catalogPath: "/api/v1/catalog",
  auth: { scheme: "basic" as const, consumerKey: "ck_test", consumerSecret: "cs_test" },
  cursorField: "modifiedAt",
  fetchImpl,
});

describe("RestSupplierCatalogClient.fetchCatalogSince", () => {
  it("paginiert über den Total-Pages-Header und akkumuliert alle Items", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ articleNumber: "A1", modifiedAt: "2026-06-18T08:00:00Z" }], 2))
      .mockResolvedValueOnce(jsonResponse([{ articleNumber: "A2", modifiedAt: "2026-06-18T09:30:00Z" }], 2));

    const client = new RestSupplierCatalogClient(basicOpts(fetchImpl as unknown as typeof fetch));
    const res = await client.fetchCatalogSince(null);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBe("2026-06-18T09:30:00Z"); // max modifiedAt
  });

  it("setzt Basic-Auth-Header und modified_after aus dem Cursor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], 1));
    const client = new RestSupplierCatalogClient(basicOpts(fetchImpl as unknown as typeof fetch));

    await client.fetchCatalogSince("2026-06-01T00:00:00Z");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/api/v1/catalog");
    expect(url).toContain("modified_after=2026-06-01T00%3A00%3A00Z");
    expect(url).toContain("page=1");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Basic " + Buffer.from("ck_test:cs_test").toString("base64"),
    });
  });

  it("unterstützt Bearer-Auth (z. B. Stanley/Stella)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], 1));
    const client = new RestSupplierCatalogClient({
      baseUrl: "https://stanley-stella.example",
      catalogPath: "/webservice/v2/products",
      auth: { scheme: "bearer", token: "tok_abc" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.fetchCatalogSince(null);

    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok_abc" });
  });

  it("ohne Items bleibt der Cursor erhalten", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], 1));
    const client = new RestSupplierCatalogClient(basicOpts(fetchImpl as unknown as typeof fetch));
    const res = await client.fetchCatalogSince("2026-06-01T00:00:00Z");
    expect(res.nextCursor).toBe("2026-06-01T00:00:00Z");
  });

  it("wirft bei 401 eine klare Auth-Fehlermeldung", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const client = new RestSupplierCatalogClient(basicOpts(fetchImpl as unknown as typeof fetch));
    await expect(client.fetchCatalogSince(null)).rejects.toThrow(/Authentifizierung fehlgeschlagen/);
  });
});
