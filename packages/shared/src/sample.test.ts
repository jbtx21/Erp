import { describe, expect, it } from "vitest";
import {
  SAMPLE_LOAN_DAYS,
  isSampleOverdue,
  sampleDueDate,
  sampleLoanMachine,
} from "./sample.js";

const issued = new Date(Date.UTC(2026, 0, 1));
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

describe("sampleDueDate", () => {
  it("Frist = Ausgabe + 21 Tage", () => {
    expect(SAMPLE_LOAN_DAYS).toBe(21);
    expect(sampleDueDate(issued)).toEqual(plusDays(issued, 21));
  });
});

describe("isSampleOverdue", () => {
  it("vor Frist nicht überfällig, ab Frist überfällig", () => {
    const loan = { ausgegebenAm: issued, status: "VERLIEHEN" as const };
    expect(isSampleOverdue(loan, plusDays(issued, 20))).toBe(false);
    expect(isSampleOverdue(loan, plusDays(issued, 21))).toBe(true);
    expect(isSampleOverdue(loan, plusDays(issued, 22))).toBe(true);
  });

  it("zurückgegebene oder bereits berechnete Muster sind nie überfällig", () => {
    expect(isSampleOverdue({ ausgegebenAm: issued, status: "ZURUECK" }, plusDays(issued, 30))).toBe(false);
    expect(isSampleOverdue({ ausgegebenAm: issued, status: "BERECHNET" }, plusDays(issued, 30))).toBe(false);
  });
});

describe("sampleLoanMachine", () => {
  it("erlaubt Rückgabe und Berechnung aus VERLIEHEN, sonst nichts", () => {
    expect(sampleLoanMachine.can("VERLIEHEN", "ZURUECK")).toBe(true);
    expect(sampleLoanMachine.can("VERLIEHEN", "BERECHNET")).toBe(true);
    expect(sampleLoanMachine.isFinal("ZURUECK")).toBe(true);
    expect(sampleLoanMachine.isFinal("BERECHNET")).toBe(true);
    expect(sampleLoanMachine.can("ZURUECK", "BERECHNET")).toBe(false);
  });
});
