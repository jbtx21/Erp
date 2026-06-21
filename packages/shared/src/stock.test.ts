import { describe, expect, it } from "vitest";
import {
  balanceByLager,
  currentBalance,
  inventoryCorrectionDelta,
  type StockMoveLike,
} from "./stock.js";

const moves: StockMoveLike[] = [
  { deltaQty: 100, lager: "HAUPT" }, // Eröffnung
  { deltaQty: 50, lager: "HAUPT" }, // Wareneingang
  { deltaQty: -30, lager: "HAUPT" }, // Verbrauch
  { deltaQty: 5, lager: "MUSTER" }, // Musterausgabe
  { deltaQty: -2, lager: "MUSTER" }, // Musterrücknahme
];

describe("currentBalance", () => {
  it("summiert alle Deltas", () => {
    expect(currentBalance(moves)).toBe(123);
    expect(currentBalance([])).toBe(0);
  });
});

describe("balanceByLager", () => {
  it("trennt HAUPT- und MUSTER-Bestand", () => {
    expect(balanceByLager(moves)).toEqual({ HAUPT: 120, MUSTER: 3 });
  });

  it("ordnet Bewegungen ohne Lager dem HAUPT-Lager zu", () => {
    expect(balanceByLager([{ deltaQty: 7 }])).toEqual({ HAUPT: 7, MUSTER: 0 });
  });
});

describe("inventoryCorrectionDelta", () => {
  it("Ist > Soll → positiver Zugang", () => {
    expect(inventoryCorrectionDelta(120, 115)).toBe(5);
  });
  it("Ist < Soll → negativer Abgang", () => {
    expect(inventoryCorrectionDelta(98, 100)).toBe(-2);
  });
  it("Ist = Soll → keine Bewegung", () => {
    expect(inventoryCorrectionDelta(100, 100)).toBe(0);
  });
});
