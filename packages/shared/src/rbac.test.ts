import { describe, expect, it } from "vitest";
import {
  canViewCustomerData,
  canViewFinancials,
  redactOrderForRole,
  type Role,
} from "./rbac.js";

const order = { id: "o1", number: "AB-1", totalNetCents: 12990, employeeNote: "Max <max@acme.de>" };

describe("rbac — Produktion ohne Preis-/Kundenzugriff (Kap. 12)", () => {
  it("Sichtbarkeits-Prädikate je Rolle", () => {
    expect(canViewFinancials("PRODUKTION")).toBe(false);
    expect(canViewCustomerData("PRODUKTION")).toBe(false);
    for (const r of ["ADMIN", "BUERO", "BUCHHALTUNG"] as Role[]) {
      expect(canViewFinancials(r)).toBe(true);
      expect(canViewCustomerData(r)).toBe(true);
    }
  });

  it("redigiert Preis und Kundenvermerk für PRODUKTION", () => {
    const redacted = redactOrderForRole(order, "PRODUKTION");
    expect(redacted.totalNetCents).toBeNull();
    expect(redacted.employeeNote).toBeNull();
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
