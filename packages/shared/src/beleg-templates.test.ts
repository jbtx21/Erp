import { describe, expect, it } from "vitest";
import { BELEG_MAIL_TEMPLATES, belegTemplateByKind, belegTemplateKey, isBelegTemplateKey, renderTemplate } from "./index.js";

describe("Belegvorlagen (G-5)", () => {
  it("deckt genau die 7 versendbaren Belegtypen ab", () => {
    expect(BELEG_MAIL_TEMPLATES.map((t) => t.kind)).toEqual([
      "QUOTE", "AUFTRAGSBESTAETIGUNG", "INVOICE", "LIEFERSCHEIN", "GUTSCHRIFT", "MAHNUNG", "LEIHGUT",
    ]);
  });

  it("liefert eindeutige, beleg.*-präfixierte Schlüssel", () => {
    const keys = BELEG_MAIL_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.startsWith("beleg."))).toBe(true);
    expect(belegTemplateKey("INVOICE")).toBe("beleg.invoice");
    expect(isBelegTemplateKey("beleg.quote")).toBe(true);
    expect(isBelegTemplateKey("auftrag.versendet")).toBe(false);
  });

  it("rendert den Default-Betreff mit der Belegnummer (Platzhalter {{ belegnr }})", () => {
    const tpl = belegTemplateByKind("QUOTE");
    expect(renderTemplate(tpl.subject, { belegnr: "AN-2026-0001" })).toBe("Angebot AN-2026-0001");
    expect(renderTemplate(tpl.body, { belegnr: "AN-2026-0001" })).toContain("anbei erhalten Sie unser Angebot als PDF.");
  });
});
