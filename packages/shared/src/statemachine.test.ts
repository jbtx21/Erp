import { describe, expect, it } from "vitest";
import { StateTransitionError, defineMachine } from "./statemachine.js";
import { orderStatusMachine } from "./order.js";
import { quoteStatusMachine } from "./quote.js";

type Light = "RED" | "GREEN" | "OFF";
const traffic = defineMachine<Light>("Traffic", {
  RED: ["GREEN", "OFF"],
  GREEN: ["RED", "OFF"],
  OFF: [],
});

describe("defineMachine", () => {
  it("kennt erlaubte Folgezustände", () => {
    expect(traffic.next("RED")).toEqual(["GREEN", "OFF"]);
    expect(traffic.can("RED", "GREEN")).toBe(true);
    expect(traffic.can("RED", "RED")).toBe(false);
  });

  it("assert gibt das Ziel zurück oder wirft", () => {
    expect(traffic.assert("RED", "GREEN")).toBe("GREEN");
    expect(() => traffic.assert("GREEN", "GREEN")).toThrow(StateTransitionError);
  });

  it("erkennt Endzustände", () => {
    expect(traffic.isFinal("OFF")).toBe(true);
    expect(traffic.isFinal("RED")).toBe(false);
  });

  it("nennt Maschine + Übergang im Fehler", () => {
    try {
      traffic.assert("OFF", "RED");
      throw new Error("sollte werfen");
    } catch (e) {
      expect(e).toBeInstanceOf(StateTransitionError);
      expect((e as StateTransitionError).machine).toBe("Traffic");
      expect((e as Error).message).toContain("OFF → RED");
    }
  });
});

describe("orderStatusMachine", () => {
  it("läuft die Vorgangskette vorwärts", () => {
    expect(orderStatusMachine.can("ANGELEGT", "IN_BEARBEITUNG")).toBe(true);
    expect(orderStatusMachine.can("IN_PRODUKTION", "VERSANDBEREIT")).toBe(true);
    expect(orderStatusMachine.can("VERSANDBEREIT", "VERSENDET")).toBe(true);
  });

  it("erlaubt Storno aus nicht-finalen Status, nicht aber Rückwärts", () => {
    expect(orderStatusMachine.can("IN_PRODUKTION", "STORNIERT")).toBe(true);
    expect(orderStatusMachine.can("VERSENDET", "STORNIERT")).toBe(false);
    expect(orderStatusMachine.can("IN_PRODUKTION", "ANGELEGT")).toBe(false);
  });

  it("Nachkette nach Versand: VERSENDET → FAKTURIERT → ABGESCHLOSSEN (B9/K-26)", () => {
    expect(orderStatusMachine.can("VERSENDET", "FAKTURIERT")).toBe(true);
    expect(orderStatusMachine.can("FAKTURIERT", "ABGESCHLOSSEN")).toBe(true);
    expect(orderStatusMachine.isFinal("ABGESCHLOSSEN")).toBe(true);
    // Kein Storno mehr nach Versand, keine Sprünge.
    expect(orderStatusMachine.can("VERSENDET", "STORNIERT")).toBe(false);
    expect(orderStatusMachine.can("VERSENDET", "ABGESCHLOSSEN")).toBe(false);
  });

  it("STORNIERT ist final; VERSENDET nicht mehr (Nachkette folgt)", () => {
    expect(orderStatusMachine.isFinal("STORNIERT")).toBe(true);
    expect(orderStatusMachine.isFinal("VERSENDET")).toBe(false);
  });
});

describe("quoteStatusMachine", () => {
  it("Funnel: ENTWURF → VERSENDET → ANGENOMMEN", () => {
    expect(quoteStatusMachine.can("ENTWURF", "VERSENDET")).toBe(true);
    expect(quoteStatusMachine.can("VERSENDET", "ANGENOMMEN")).toBe(true);
    expect(quoteStatusMachine.can("NACHFASSEN", "ABGELEHNT")).toBe(true);
  });

  it("ANGENOMMEN und ABGELEHNT sind final", () => {
    expect(quoteStatusMachine.isFinal("ANGENOMMEN")).toBe(true);
    expect(quoteStatusMachine.isFinal("ABGELEHNT")).toBe(true);
    expect(quoteStatusMachine.can("ANGENOMMEN", "VERSENDET")).toBe(false);
  });
});
