import { describe, expect, it } from "vitest";
import {
  canViewCustomerData,
  canViewFinancials,
  redactOrderForRole,
  type Role,
} from "./rbac.js";

const order = { id: "o1", number: "AB-1", totalNetCents: 12990, employeeNote: "Max <max@acme.de>" };

describe("rbac — Produktion liest alles, nur ohne Preise (Kap. 12)", () => {
  it("Sichtbarkeits-Prädikate je Rolle", () => {
    // Preise: für PRODUKTION verborgen.
    expect(canViewFinancials("PRODUKTION")).toBe(false);
    // Kundendaten: Policy — alle Rollen dürfen lesen.
    expect(canViewCustomerData("PRODUKTION")).toBe(true);
    for (const r of ["ADMIN", "BUERO", "BUCHHALTUNG"] as Role[]) {
      expect(canViewFinancials(r)).toBe(true);
      expect(canViewCustomerData(r)).toBe(true);
    }
  });

  it("redigiert nur den Preis für PRODUKTION, Kundenvermerk bleibt sichtbar", () => {
    const redacted = redactOrderForRole(order, "PRODUKTION");
    expect(redacted.totalNetCents).toBeNull();
    expect(redacted.employeeNote).toBe("Max <max@acme.de>"); // Kundendaten sichtbar
    expect(redacted.number).toBe("AB-1"); // nicht-sensible Felder bleiben
  });

  it("lässt Preis/Kundenvermerk für BUERO unverändert", () => {
    const seen = redactOrderForRole(order, "BUERO");
    expect(seen.totalNetCents).toBe(12990);
    expect(seen.employeeNote).toBe("Max <max@acme.de>");
  });

  it("mutiert das Original nicht", () => {
    redactOrderForRole(order, "PRODUKTION");
    expect(order.totalNetCents).toBe(12990);
  });
});
