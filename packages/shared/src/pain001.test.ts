import { describe, expect, it } from "vitest";
import {
  buildPain001,
  ibanIsValid,
  paymentOrderTotalCents,
  validateSepaPaymentOrder,
  type SepaPaymentOrder,
} from "./pain001.js";

const order: SepaPaymentOrder = {
  messageId: "MSG-2026-001",
  debtorName: "TEXMA GmbH",
  debtorIban: "DE89370400440532013000",
  debtorBic: "COBADEFFXXX",
  requestedExecutionDate: "2026-06-22",
  createdAt: new Date("2026-06-20T10:00:00Z"),
  transfers: [
    { creditorName: "Garn & Co KG", creditorIban: "DE02120300000000202051", amountCents: 12_345, remittance: "RE-2026-0007" },
    { creditorName: "Stick <Nord>", creditorIban: "DE02500105170137075030", amountCents: 5_000, remittance: "RE-2026-0008" },
  ],
};

describe("IBAN-Prüfung (mod-97)", () => {
  it("akzeptiert gültige IBANs (auch mit Leerzeichen/Kleinschreibung)", () => {
    expect(ibanIsValid("DE89370400440532013000")).toBe(true);
    expect(ibanIsValid("de89 3704 0044 0532 0130 00")).toBe(true);
  });
  it("lehnt falsche Prüfziffer / Struktur ab", () => {
    expect(ibanIsValid("DE89370400440532013001")).toBe(false);
    expect(ibanIsValid("XX12")).toBe(false);
    expect(ibanIsValid("")).toBe(false);
  });
});

describe("buildPain001", () => {
  const xml = buildPain001(order);

  it("erzeugt pain.001.001.09 mit korrekter Anzahl + Kontrollsumme", () => {
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"');
    expect(xml).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>173.45</CtrlSum>"); // 123,45 + 50,00
    expect(paymentOrderTotalCents(order)).toBe(17_345);
  });

  it("enthält Schuldner- und Gläubiger-IBANs + Beträge", () => {
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
    expect(xml).toContain("<IBAN>DE02120300000000202051</IBAN>");
    expect(xml).toContain('<InstdAmt Ccy="EUR">123.45</InstdAmt>');
    expect(xml).toContain("<EndToEndId>MSG-2026-001-1</EndToEndId>");
  });

  it("escaped XML-Sonderzeichen im Empfängernamen", () => {
    expect(xml).toContain("Stick &lt;Nord&gt;");
  });

  it("verwendet den festen Erstellzeitpunkt (kein Millisekunden-Suffix)", () => {
    expect(xml).toContain("<CreDtTm>2026-06-20T10:00:00Z</CreDtTm>");
  });
});

describe("validateSepaPaymentOrder", () => {
  it("akzeptiert einen gültigen Auftrag", () => {
    expect(() => validateSepaPaymentOrder(order)).not.toThrow();
  });
  it("lehnt ungültige IBAN, Betrag ≤ 0 und leere Auftragsliste ab", () => {
    expect(() => buildPain001({ ...order, debtorIban: "DE00" })).toThrow(/Auftraggeber-IBAN/);
    expect(() => buildPain001({ ...order, transfers: [] })).toThrow(/Mindestens eine/);
    expect(() =>
      buildPain001({ ...order, transfers: [{ ...order.transfers[0]!, amountCents: 0 }] })
    ).toThrow(/Betrag muss > 0/);
    expect(() =>
      buildPain001({ ...order, transfers: [{ ...order.transfers[0]!, creditorIban: "DE89370400440532013001" }] })
    ).toThrow(/Empfänger-IBAN/);
  });
});
