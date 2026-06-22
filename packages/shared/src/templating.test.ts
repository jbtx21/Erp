import { describe, expect, it } from "vitest";
import { renderTemplate, templatePlaceholders } from "./templating.js";

describe("renderTemplate (G-5)", () => {
  it("ersetzt bekannte Platzhalter (mit/ohne Leerzeichen)", () => {
    expect(renderTemplate("Hallo {{name}}, Auftrag {{ nr }}.", { name: "Max", nr: "WC-1" }))
      .toBe("Hallo Max, Auftrag WC-1.");
  });
  it("lässt unbekannte Platzhalter sichtbar stehen", () => {
    expect(renderTemplate("Betrag {{betrag}}", {})).toBe("Betrag {{betrag}}");
  });
  it("wandelt Zahlen in Strings", () => {
    expect(renderTemplate("{{n}} Stück", { n: 5 })).toBe("5 Stück");
  });
});

describe("templatePlaceholders", () => {
  it("listet referenzierte Schlüssel ohne Duplikate", () => {
    expect(templatePlaceholders("{{a}} {{ b }} {{a}}").sort()).toEqual(["a", "b"]);
  });
});
