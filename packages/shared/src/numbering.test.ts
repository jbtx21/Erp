import { describe, expect, it } from "vitest";
import {
  SEQUENCE_PREFIX,
  formatNumber,
  formatSequenceNumber,
  type SequenceKey,
} from "./numbering.js";

describe("formatNumber", () => {
  it("formatiert als PREFIX-JAHR-NNNN mit Default-Padding 4", () => {
    expect(formatNumber("RE", 2026, 1)).toBe("RE-2026-0001");
    expect(formatNumber("RE", 2026, 42)).toBe("RE-2026-0042");
    expect(formatNumber("RE", 2026, 12345)).toBe("RE-2026-12345");
  });

  it("respektiert eigenes Padding", () => {
    expect(formatNumber("AB", 2026, 7, { pad: 6 })).toBe("AB-2026-000007");
  });

  it("wirft bei ungültiger laufender Nummer", () => {
    expect(() => formatNumber("RE", 2026, 0)).toThrow();
    expect(() => formatNumber("RE", 2026, -1)).toThrow();
    expect(() => formatNumber("RE", 2026, 1.5)).toThrow();
  });

  it("wirft bei ungültigem Jahr", () => {
    expect(() => formatNumber("RE", 1999, 1)).toThrow();
  });
});

describe("formatSequenceNumber", () => {
  it("nutzt das Standard-Präfix je Belegart", () => {
    expect(formatSequenceNumber("INVOICE", 2026, 1)).toBe("RE-2026-0001");
    expect(formatSequenceNumber("CREDIT_NOTE", 2026, 3)).toBe("GS-2026-0003");
    expect(formatSequenceNumber("INQUIRY", 2026, 9)).toBe("AF-2026-0009");
  });

  it("deckt jede Belegart mit einem Präfix ab", () => {
    const keys: SequenceKey[] = [
      "INVOICE",
      "CREDIT_NOTE",
      "ORDER",
      "QUOTE",
      "INQUIRY",
      "PURCHASE_ORDER",
      "DELIVERY_NOTE",
      "PRODUCTION_ORDER",
      "CASH_RECEIPT",
    ];
    for (const k of keys) {
      expect(SEQUENCE_PREFIX[k]).toMatch(/^[A-Z]{2,3}$/);
    }
  });
});
