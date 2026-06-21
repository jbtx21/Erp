import { describe, expect, it } from "vitest";
import { StateTransitionError } from "./statemachine.js";
import {
  assertLeadDiscardable,
  canConvertLead,
  LeadError,
  leadStatusMachine,
} from "./lead.js";

describe("leadStatusMachine (B15)", () => {
  it("Funnel: NEU → KONTAKTIERT → QUALIFIZIERT → KONVERTIERT", () => {
    expect(leadStatusMachine.can("NEU", "KONTAKTIERT")).toBe(true);
    expect(leadStatusMachine.can("KONTAKTIERT", "QUALIFIZIERT")).toBe(true);
    expect(leadStatusMachine.can("QUALIFIZIERT", "KONVERTIERT")).toBe(true);
  });

  it("KONVERTIERT/VERWORFEN sind final", () => {
    expect(leadStatusMachine.isFinal("KONVERTIERT")).toBe(true);
    expect(leadStatusMachine.isFinal("VERWORFEN")).toBe(true);
  });
});

describe("canConvertLead (B15)", () => {
  it("nur aus QUALIFIZIERT konvertierbar", () => {
    expect(canConvertLead("QUALIFIZIERT")).toBe(true);
    expect(canConvertLead("NEU")).toBe(false);
    expect(canConvertLead("KONTAKTIERT")).toBe(false);
    expect(canConvertLead("VERWORFEN")).toBe(false);
  });
});

describe("assertLeadDiscardable (B15)", () => {
  it("verwirft offenen Lead mit Grund", () => {
    expect(() => assertLeadDiscardable("KONTAKTIERT", "kein Bedarf")).not.toThrow();
  });
  it("verlangt einen Grund", () => {
    expect(() => assertLeadDiscardable("NEU", "  ")).toThrow(LeadError);
  });
  it("blockiert Verwerfen aus finalem Status", () => {
    expect(() => assertLeadDiscardable("KONVERTIERT", "egal")).toThrow(StateTransitionError);
  });
});
