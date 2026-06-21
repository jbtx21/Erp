import { describe, expect, it } from "vitest";
import { StateTransitionError } from "./statemachine.js";
import {
  assertInquiryDiscardable,
  canConvertToQuote,
  InquiryError,
  inquiryStatusMachine,
} from "./inquiry.js";

describe("inquiryStatusMachine (B20)", () => {
  it("Funnel: NEU → IN_BEARBEITUNG → ANGEBOT", () => {
    expect(inquiryStatusMachine.can("NEU", "IN_BEARBEITUNG")).toBe(true);
    expect(inquiryStatusMachine.can("IN_BEARBEITUNG", "ANGEBOT")).toBe(true);
    expect(inquiryStatusMachine.can("NEU", "ANGEBOT")).toBe(true); // Direktkonversion erlaubt
  });

  it("ANGEBOT und VERWORFEN sind final", () => {
    expect(inquiryStatusMachine.isFinal("ANGEBOT")).toBe(true);
    expect(inquiryStatusMachine.isFinal("VERWORFEN")).toBe(true);
  });

  it("canConvertToQuote nur aus offenen Status", () => {
    expect(canConvertToQuote("NEU")).toBe(true);
    expect(canConvertToQuote("IN_BEARBEITUNG")).toBe(true);
    expect(canConvertToQuote("VERWORFEN")).toBe(false);
    expect(canConvertToQuote("ANGEBOT")).toBe(false);
  });
});

describe("assertInquiryDiscardable (B20)", () => {
  it("verwirft offene Anfrage mit Grund", () => {
    expect(() => assertInquiryDiscardable("NEU", "Budget zu klein")).not.toThrow();
  });

  it("verlangt einen Grund", () => {
    expect(() => assertInquiryDiscardable("NEU", "  ")).toThrow(InquiryError);
  });

  it("blockiert Verwerfen aus finalem Status", () => {
    expect(() => assertInquiryDiscardable("ANGEBOT", "egal")).toThrow(StateTransitionError);
  });
});
