import { describe, expect, it } from "vitest";
import { StateTransitionError } from "./statemachine.js";
import {
  assertQuoteRejectable,
  isQuoteExpired,
  QuoteRejectionError,
} from "./quote.js";

const valid = new Date(Date.UTC(2026, 5, 30));

describe("isQuoteExpired (B8)", () => {
  it("offenes Angebot nach Gültigkeit ist abgelaufen", () => {
    expect(isQuoteExpired({ status: "VERSENDET", gueltigBisAm: valid }, new Date(Date.UTC(2026, 6, 1)))).toBe(true);
    expect(isQuoteExpired({ status: "VERSENDET", gueltigBisAm: valid }, valid)).toBe(false); // am Tag noch gültig
    expect(isQuoteExpired({ status: "VERSENDET", gueltigBisAm: valid }, new Date(Date.UTC(2026, 5, 29)))).toBe(false);
  });

  it("ohne Gültigkeitsdatum nie abgelaufen", () => {
    expect(isQuoteExpired({ status: "VERSENDET", gueltigBisAm: null }, new Date())).toBe(false);
  });

  it("finale Angebote (angenommen/abgelehnt) laufen nicht ab", () => {
    expect(isQuoteExpired({ status: "ANGENOMMEN", gueltigBisAm: valid }, new Date(Date.UTC(2027, 0, 1)))).toBe(false);
    expect(isQuoteExpired({ status: "ABGELEHNT", gueltigBisAm: valid }, new Date(Date.UTC(2027, 0, 1)))).toBe(false);
  });

  it("ein Entwurf verfällt nicht (nie gesendet); NACHFASSEN verfällt", () => {
    expect(isQuoteExpired({ status: "ENTWURF", gueltigBisAm: valid }, new Date(Date.UTC(2027, 0, 1)))).toBe(false);
    expect(isQuoteExpired({ status: "NACHFASSEN", gueltigBisAm: valid }, new Date(Date.UTC(2026, 6, 1)))).toBe(true);
  });
});

describe("assertQuoteRejectable (B8)", () => {
  it("akzeptiert Ablehnung mit Grund aus offenem Status", () => {
    expect(() => assertQuoteRejectable("VERSENDET", "zu teuer")).not.toThrow();
    expect(() => assertQuoteRejectable("NACHFASSEN", "Wettbewerber")).not.toThrow();
  });

  it("verlangt einen Verlustgrund", () => {
    expect(() => assertQuoteRejectable("VERSENDET", "")).toThrow(QuoteRejectionError);
    expect(() => assertQuoteRejectable("VERSENDET", "   ")).toThrow(QuoteRejectionError);
  });

  it("blockiert Ablehnung aus finalem Status", () => {
    expect(() => assertQuoteRejectable("ANGENOMMEN", "egal")).toThrow(StateTransitionError);
  });
});
