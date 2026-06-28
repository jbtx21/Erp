import { describe, expect, it } from "vitest";
import { reconcileEk, type EkInvoiceLine } from "./ek-reconciliation.js";

const master = new Map<string, number>([
  ["v1", 1000], // Stamm-EK 10,00 €
  ["v2", 500], // 5,00 €
]);

describe("reconcileEk (EK-Abgleich Rechnung ↔ Stammdaten)", () => {
  it("alle Positionen im Toleranzband → OK", () => {
    const lines: EkInvoiceLine[] = [
      { ref: "v1", variantId: "v1", qty: 10, invoiceUnitEkCents: 1015 }, // +1,5 % < 2 %
      { ref: "v2", variantId: "v2", qty: 5, invoiceUnitEkCents: 500 },
    ];
    const r = reconcileEk(lines, master);
    expect(r.overall).toBe("OK");
    expect(r.lines.every((l) => l.verdict === "OK")).toBe(true);
  });

  it("Abweichung über Toleranz → ABWEICHUNG + diff ausgewiesen", () => {
    const lines: EkInvoiceLine[] = [
      { ref: "v1", variantId: "v1", qty: 10, invoiceUnitEkCents: 1100 }, // +10 %
    ];
    const r = reconcileEk(lines, master);
    expect(r.overall).toBe("ABWEICHUNG");
    expect(r.lines[0]!.verdict).toBe("ABWEICHUNG");
    expect(r.lines[0]!.diffCents).toBe(100);
    expect(r.lines[0]!.diffPercent).toBeCloseTo(10);
    expect(r.maxAbsDiffPercent).toBeCloseTo(10);
  });

  it("nicht zuordenbare Position oder fehlender Stamm → PRUEFUNG (nicht ABWEICHUNG)", () => {
    const lines: EkInvoiceLine[] = [
      { ref: "v1", variantId: "v1", qty: 1, invoiceUnitEkCents: 1000 }, // OK
      { ref: "Fremdartikel", variantId: null, qty: 1, invoiceUnitEkCents: 999 }, // nicht zugeordnet
      { ref: "v9", variantId: "v9", qty: 1, invoiceUnitEkCents: 800 }, // kein Stamm
    ];
    const r = reconcileEk(lines, master);
    expect(r.overall).toBe("PRUEFUNG");
    expect(r.lines[1]!.verdict).toBe("NICHT_ZUGEORDNET");
    expect(r.lines[2]!.verdict).toBe("KEIN_STAMM");
  });

  it("Cent-Untergrenze schützt Kleinstpreise vor Rundungsrauschen", () => {
    // Stamm 5,00 €, 2 % = 10 ct, aber floor greift erst darunter; +3 ct ≤ max(10,2)=10 → OK.
    const r = reconcileEk([{ ref: "v2", variantId: "v2", qty: 1, invoiceUnitEkCents: 503 }], master);
    expect(r.lines[0]!.verdict).toBe("OK");
  });

  it("ABWEICHUNG dominiert PRUEFUNG im Gesamturteil", () => {
    const lines: EkInvoiceLine[] = [
      { ref: "v1", variantId: "v1", qty: 1, invoiceUnitEkCents: 1500 }, // +50 %
      { ref: "x", variantId: null, qty: 1, invoiceUnitEkCents: 1 },
    ];
    expect(reconcileEk(lines, master).overall).toBe("ABWEICHUNG");
  });
});
