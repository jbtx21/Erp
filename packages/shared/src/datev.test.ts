import { describe, expect, it } from "vitest";
import {
  buchungenFromCreditNote,
  buchungenFromInvoice,
  buildDatevStapel,
  creditNoteTaxByRate,
  invoiceTaxByRate,
  snapTaxRate,
  toDatevCsv,
} from "./datev.js";

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

  it("Gutschrift: je Satz eine HABEN-Buchung (Storno der Forderung, DATEV-001)", () => {
    const buchungen = buchungenFromCreditNote(
      { number: "GU-2026-0001", issuedAt: new Date("2026-03-06T10:00:00Z"), debitorKonto: "10001", originalInvoiceNumber: "RE-2026-0001", taxByRate: [{ rate: 0.19, netCents: 10000 }] },
      erloes
    );
    expect(buchungen).toHaveLength(1);
    expect(buchungen[0]).toMatchObject({ umsatzCents: 10000, sollHaben: "H", konto: "10001", gegenkonto: "8400", buSchluessel: "9", belegfeld1: "GU-2026-0001" });
    expect(buchungen[0]!.buchungstext).toBe("Gutschrift GU-2026-0001 zu RE-2026-0001");
  });

  it("Gutschrift: serialisiert mit H und positivem Betrag (Math.abs nur mit H-Flip korrekt)", () => {
    const csv = toDatevCsv(buchungenFromCreditNote(
      { number: "GU-1", issuedAt: new Date("2026-03-06T10:00:00Z"), debitorKonto: "10001", taxByRate: [{ rate: 0.19, netCents: 10000 }] },
      erloes
    ));
    expect(csv.split("\r\n")[1]).toBe('100,00;H;10001;8400;9;0603;"GU-1";"Gutschrift GU-1"');
  });
});

describe("DATEV-Periodenstapel (Rechnungen + Gutschriften)", () => {
  const erloes = { standard: "8400", reduced: "8300" };

  it("snapTaxRate rundet Cent-Rundungsdifferenzen auf den Normsatz", () => {
    expect(snapTaxRate(1900 / 10000)).toBe(0.19);
    expect(snapTaxRate(699 / 10000)).toBe(0.07); // 6,99 % → 7 %
    expect(snapTaxRate(0)).toBe(0);
  });

  it("invoiceTaxByRate leitet den Satz aus Netto/Steuer ab", () => {
    expect(invoiceTaxByRate(10000, 1900)).toEqual([{ rate: 0.19, netCents: 10000 }]);
    expect(invoiceTaxByRate(0, 0)).toEqual([{ rate: 0, netCents: 0 }]);
  });

  it("creditNoteTaxByRate rechnet das Brutto über den Originalsatz auf Netto zurück", () => {
    // Vollgutschrift einer 100,00-€-netto-19%-Rechnung (119,00 € brutto) → 100,00 € netto.
    expect(creditNoteTaxByRate(11900, 10000, 1900)).toEqual([{ rate: 0.19, netCents: 10000 }]);
    // Teilgutschrift 59,50 € brutto → 50,00 € netto.
    expect(creditNoteTaxByRate(5950, 10000, 1900)).toEqual([{ rate: 0.19, netCents: 5000 }]);
  });

  it("buildDatevStapel reiht Rechnungen (SOLL) vor Gutschriften (HABEN)", () => {
    const stapel = buildDatevStapel({
      invoices: [{ number: "RE-1", issuedAt: new Date("2026-03-05T10:00:00Z"), debitorKonto: "10001", taxByRate: invoiceTaxByRate(10000, 1900) }],
      creditNotes: [{ number: "GU-1", issuedAt: new Date("2026-03-06T10:00:00Z"), debitorKonto: "10001", originalInvoiceNumber: "RE-1", taxByRate: creditNoteTaxByRate(11900, 10000, 1900) }],
      erloes,
    });
    expect(stapel.map((b) => b.sollHaben)).toEqual(["S", "H"]);
    expect(stapel[0]).toMatchObject({ belegfeld1: "RE-1", konto: "10001", gegenkonto: "8400" });
    expect(stapel[1]).toMatchObject({ belegfeld1: "GU-1", buchungstext: "Gutschrift GU-1 zu RE-1" });
  });
});
