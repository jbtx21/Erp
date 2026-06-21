import { describe, expect, it } from "vitest";
import {
  ANON_TEXT,
  anonymizeCompany,
  anonymizeContact,
  isContactAnonymized,
} from "./privacy.js";

describe("anonymizeContact (B12 / DSGVO)", () => {
  it("überschreibt Name/E-Mail/Telefon, erhält die Rolle", () => {
    const a = anonymizeContact({ firstName: "Max", lastName: "Muster", email: "m@x.de", phone: "0123", role: "Einkauf" });
    expect(a).toEqual({ firstName: ANON_TEXT, lastName: ANON_TEXT, email: null, phone: null, role: "Einkauf" });
  });

  it("isContactAnonymized erkennt anonymisierte Kontakte", () => {
    expect(isContactAnonymized(anonymizeContact({ firstName: "A", lastName: "B" }))).toBe(true);
    expect(isContactAnonymized({ firstName: "Max", lastName: "Muster" })).toBe(false);
  });
});

describe("anonymizeCompany (B12)", () => {
  it("überschreibt den Namen, erhält die Branche", () => {
    expect(anonymizeCompany({ name: "Muster GmbH", branche: "Textil" })).toEqual({ name: ANON_TEXT, branche: "Textil" });
  });
});
