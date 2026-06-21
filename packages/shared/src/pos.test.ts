import { describe, expect, it } from "vitest";
import {
  DSFINVK_HEADER,
  dsfinvkExport,
  dsfinvkRow,
  isTseSigned,
  type CashSaleRecord,
} from "./pos.js";

const sale: CashSaleRecord = {
  belegNr: "BON-2026-0001",
  betragCents: 2499,
  art: "BAR",
  kassiertAm: new Date(Date.UTC(2026, 5, 21, 9, 30, 0)),
  kassierer: "M. Mustermann",
  tseSignatur: "AbC123==",
  tseSeriennummer: "TSE-SN-42",
  tseTxId: "tx-1001",
};

describe("DSFinV-K-Export (B6)", () => {
  it("Zeile enthält Beleg, Betrag, Zahlart und TSE-Felder", () => {
    const row = dsfinvkRow(sale);
    expect(row).toBe("BON-2026-0001;2026-06-21T09:30:00Z;24.99;BAR;M. Mustermann;TSE-SN-42;tx-1001;AbC123==");
  });

  it("Export hat Kopfzeile + je Beleg eine Zeile", () => {
    const csv = dsfinvkExport([sale, { ...sale, belegNr: "BON-2026-0002", art: "EC" }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(DSFINVK_HEADER);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain(";EC;");
  });

  it("escaped Trennzeichen im Kassierernamen", () => {
    expect(dsfinvkRow({ ...sale, kassierer: "Mey;er" })).toContain('"Mey;er"');
  });
});

describe("isTseSigned (B6 / KassenSichV)", () => {
  it("verlangt Signatur, Seriennummer und Transaktion", () => {
    expect(isTseSigned(sale)).toBe(true);
    expect(isTseSigned({ ...sale, tseSignatur: "" })).toBe(false);
    expect(isTseSigned({ ...sale, tseTxId: "  " })).toBe(false);
  });
});
