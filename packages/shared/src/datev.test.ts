import { describe, expect, it } from "vitest";
import { buchungenFromInvoice, toDatevCsv } from "./datev.js";

describe("DATEV-Export (T-07)", () => {
  const erloes = { standard: "8400", reduced: "8300" };

  it("erzeugt je Steuersatz eine Debitor-Buchung über den Netto-Betrag", () => {
    const buchungen = buchungenFromInvoice(
      {
        number: "RE-2026-0001",
        issuedAt: new Date("2026-03-05T10:00:00Z"),
        debitorKonto: "10001",
        taxByRate: [
          { rate: 0.07, netCents: 5000 },
          { rate: 0.19, netCents: 10000 },
        ],
      },
      erloes
    );
    expect(buchungen).toHaveLength(2);
    expect(buchungen[1]).toMatchObject({
      umsatzCents: 10000,
      sollHaben: "S",
      konto: "10001",
      gegenkonto: "8400",
      buSchluessel: "9",
      belegfeld1: "RE-2026-0001",
    });
    expect(buchungen[0]).toMatchObject({ gegenkonto: "8300", buSchluessel: "8" });
  });

  it("serialisiert als DATEV-CSV (Komma-Betrag, TTMM-Datum)", () => {
    const csv = toDatevCsv(
      buchungenFromInvoice(
        {
          number: "RE-1",
          issuedAt: new Date("2026-03-05T10:00:00Z"),
          debitorKonto: "10001",
          taxByRate: [{ rate: 0.19, netCents: 10000 }],
        },
        erloes
      )
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Umsatz;Soll/Haben-Kennzeichen");
    expect(lines[1]).toBe('100,00;S;10001;8400;9;0503;"RE-1";"Rechnung RE-1"');
  });
});
