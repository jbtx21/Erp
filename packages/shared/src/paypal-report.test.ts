import { describe, expect, it } from "vitest";
import { paypalCredits, parsePaypalCsv, paypalCreditsFromCsv, type PaypalTxn } from "./paypal-report.js";

describe("paypalCredits — Normalisierung", () => {
  const txns: PaypalTxn[] = [
    { transactionId: "PP-1", grossCents: 11900, feeCents: -348, currency: "eur", status: "Abgeschlossen", payerName: "Farverig ApS", invoiceNumber: "RE-2026-001" },
    { transactionId: "PP-2", grossCents: -5000, feeCents: 0, currency: "EUR", status: "Abgeschlossen", type: "Rückzahlung" }, // Refund → raus
    { transactionId: "PP-3", grossCents: 5000, feeCents: -200, currency: "USD", status: "Ausstehend" }, // nicht abgeschlossen → raus
  ];

  it("übernimmt nur abgeschlossene Geldeingänge mit positivem Brutto", () => {
    const credits = paypalCredits(txns);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toEqual({
      externalRef: "PP-1",
      reference: "RE-2026-001",
      amountCents: 11900,
      feeCents: 348, // Gebühr als positiver Aufwand
      currency: "EUR",
      payerName: "Farverig ApS",
    });
  });

  it("brutto klärt den OP — Gebühr ist NICHT abgezogen", () => {
    const [c] = paypalCredits([txns[0] as PaypalTxn]);
    expect(c?.amountCents).toBe(11900); // nicht 11900-348
  });
});

describe("parsePaypalCsv — deutsche und englische Spaltenköpfe", () => {
  it("parst einen deutschen PayPal-Aktivitäten-Export", () => {
    const csv = [
      "Datum,Name,Typ,Status,Währung,Brutto,Gebühr,Transaktionscode,Rechnungsnummer",
      '01.06.2026,Farverig ApS,Website-Zahlung,Abgeschlossen,EUR,"1.190,00","-34,80",PP-AAA,RE-2026-001',
      '02.06.2026,Edeka Rentschler,Zahlung,Abgeschlossen,EUR,"50,00","-1,50",PP-BBB,RE-2026-077',
    ].join("\n");
    const txns = parsePaypalCsv(csv);
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      transactionId: "PP-AAA",
      grossCents: 119000,
      feeCents: -3480,
      currency: "EUR",
      payerName: "Farverig ApS",
      invoiceNumber: "RE-2026-001",
    });

    const credits = paypalCreditsFromCsv(csv);
    expect(credits.map((c) => c.amountCents)).toEqual([119000, 5000]);
    expect(credits[0]?.feeCents).toBe(3480);
  });

  it("parst englische Spaltenköpfe", () => {
    const csv = [
      "Date,Name,Type,Status,Currency,Gross,Fee,Transaction ID,Invoice Number",
      "2026-06-01,ACME Ltd,Payment,Completed,EUR,200.00,-6.50,PP-CCC,RE-9",
    ].join("\n");
    const [t] = parsePaypalCsv(csv);
    expect(t?.transactionId).toBe("PP-CCC");
    expect(t?.grossCents).toBe(20000);
    expect(t?.invoiceNumber).toBe("RE-9");
  });

  it("überspringt Zeilen ohne Transaktionscode oder Brutto", () => {
    const csv = ["Transaktionscode,Brutto", ",100,00", "PP-X,"].join("\n");
    expect(parsePaypalCsv(csv)).toHaveLength(0);
  });
});
