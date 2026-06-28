import { describe, expect, it } from "vitest";
import { BELEG_MAIL_TEMPLATES, EMAIL_TEMPLATE_DEFAULTS, MAHNUNG_STUFE_TEMPLATES, belegTemplateByKind, belegTemplateKey, isBelegTemplateKey, mahnungTemplateKey, renderTemplate } from "./index.js";

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

  it("hat je Mahnstufe (1..3) eine eigene Vorlage ohne Mahngebühr-Erwähnung", () => {
    expect(MAHNUNG_STUFE_TEMPLATES.map((t) => t.stufe)).toEqual([1, 2, 3]);
    expect(mahnungTemplateKey(2)).toBe("beleg.mahnung.2");
    const s1 = MAHNUNG_STUFE_TEMPLATES.find((t) => t.stufe === 1)!;
    expect(renderTemplate(s1.subject, { belegnr: "MA-1" })).toBe("Zahlungserinnerung MA-1");
    // Keine Mahngebühren: in keinem Mahnstufen-Text auftauchen.
    for (const t of MAHNUNG_STUFE_TEMPLATES) expect(t.body.toLowerCase()).not.toContain("mahngebühr");
  });

  it("EMAIL_TEMPLATE_DEFAULTS bündelt Beleg- + Mahnstufen-Vorlagen mit eindeutigen Schlüsseln", () => {
    expect(EMAIL_TEMPLATE_DEFAULTS.length).toBe(BELEG_MAIL_TEMPLATES.length + MAHNUNG_STUFE_TEMPLATES.length);
    const keys = EMAIL_TEMPLATE_DEFAULTS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("beleg.mahnung.1");
  });
});
