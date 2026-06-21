import { describe, expect, it, vi } from "vitest";
import type { DpdLabelRequest } from "@texma/shared";
import { DpdRestClient } from "./dpd-client.js";

const req: DpdLabelRequest = {
  reference: "WC-500",
  recipient: { name: "ACME GmbH", street: "Hauptstr. 1", zip: "71083", city: "Herrenberg", country: "DE" },
  weightGrams: 1000,
  parcelCount: 1,
};

const opts = (fetchImpl: typeof fetch) => ({
  baseUrl: "https://api.dpd.example/",
  auth: { scheme: "basic" as const, user: "u", password: "p" },
  fetchImpl,
});

describe("DpdRestClient.requestLabel (T-06)", () => {
  it("POSTtet die Label-Anfrage mit Basic-Auth und liest die Trackingnummer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ trackingNumber: "DPD123" }), { status: 200 }));
    const client = new DpdRestClient(opts(fetchImpl as unknown as typeof fetch));

    const res = await client.requestLabel(req);

    expect(res.trackingNumber).toBe("DPD123");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/api/v1/shipments");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Basic " + Buffer.from("u:p").toString("base64"),
    });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ reference: "WC-500" });
  });

  it("liest die Trackingnummer auch aus parcels[0]", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ parcels: [{ trackingNumber: "DPD999" }] }), { status: 200 }));
    const client = new DpdRestClient(opts(fetchImpl as unknown as typeof fetch));
    expect((await client.requestLabel(req)).trackingNumber).toBe("DPD999");
  });

  it("unterstützt Bearer-Auth", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ trackingNumber: "X" }), { status: 200 }));
    const client = new DpdRestClient({
      baseUrl: "https://api.dpd.example",
      auth: { scheme: "bearer", token: "tok" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.requestLabel(req);
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("wirft bei 401 eine klare Auth-Fehlermeldung", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("no", { status: 401 }));
    const client = new DpdRestClient(opts(fetchImpl as unknown as typeof fetch));
    await expect(client.requestLabel(req)).rejects.toThrow(/Authentifizierung fehlgeschlagen/);
  });

  it("wirft, wenn die Antwort keine Trackingnummer enthält", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const client = new DpdRestClient(opts(fetchImpl as unknown as typeof fetch));
    await expect(client.requestLabel(req)).rejects.toThrow(/ohne Trackingnummer/);
  });
});
