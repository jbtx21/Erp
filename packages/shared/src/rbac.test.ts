import { describe, expect, it } from "vitest";
import {
  canViewCustomerData,
  canViewFinancials,
  redactOrderForRole,
  type Role,
} from "./rbac.js";
import { redactForRole, roleCapabilities } from "./field-permissions.js";

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

describe("field-permissions — deklaratives Feld-Register (Kap. 12)", () => {
  it("roleCapabilities: PRODUKTION ohne financial, sonst voll", () => {
    expect(roleCapabilities("PRODUKTION").has("financial")).toBe(false);
    expect(roleCapabilities("PRODUKTION").has("customerData")).toBe(true);
    for (const r of ["ADMIN", "BUERO", "BUCHHALTUNG"] as Role[]) {
      expect(roleCapabilities(r).has("financial")).toBe(true);
      expect(roleCapabilities(r).has("customerData")).toBe(true);
    }
  });

  it("nullt financial-Felder für PRODUKTION, lässt sie für andere Rollen", () => {
    const inv = { id: "r1", number: "RE-1", netCents: 10000, taxCents: 1900, grossCents: 11900, openCents: 11900 };
    const redacted = redactForRole("invoice", inv, "PRODUKTION");
    expect(redacted.netCents).toBeNull();
    expect(redacted.grossCents).toBeNull();
    expect(redacted.openCents).toBeNull();
    expect(redacted.number).toBe("RE-1"); // nicht-sensibel bleibt
    for (const r of ["ADMIN", "BUERO", "BUCHHALTUNG"] as Role[]) {
      const seen = redactForRole("invoice", inv, r);
      expect(seen.netCents).toBe(10000);
      expect(seen.grossCents).toBe(11900);
    }
  });

  it("Wrapper-Äquivalenz: redactOrderForRole == redactForRole('order', …)", () => {
    for (const r of ["ADMIN", "BUERO", "BUCHHALTUNG", "PRODUKTION"] as Role[]) {
      expect(redactOrderForRole(order, r)).toEqual(redactForRole("order", order, r));
    }
  });

  it("fehlendes Feld im Item → kein Crash, keine neuen Schlüssel", () => {
    const sparse = { id: "q1", totalNetCents: 5000 }; // ohne totalGrossCents/totalDbCents/companyName
    const redacted = redactForRole("quote", sparse, "PRODUKTION");
    expect(redacted.totalNetCents).toBeNull();
    expect(Object.keys(redacted).sort()).toEqual(["id", "totalNetCents"]);
  });

  it("customerData-Capability greift, wenn ein Feld sie erfordert", () => {
    // Kunstpolicy-nahes Verhalten: solange canViewCustomerData für alle true ist, bleiben
    // Kundenfelder sichtbar — hier explizit für den Auftrag verifiziert.
    const ord = { id: "o2", totalNetCents: 999, companyName: "ACME GmbH", employeeNote: "x" };
    const prod = redactForRole("order", ord, "PRODUKTION");
    expect(prod.totalNetCents).toBeNull(); // financial weg
    expect(prod.companyName).toBe("ACME GmbH"); // customerData bleibt (Policy)
    expect(prod.employeeNote).toBe("x");
  });
});
