import { describe, expect, it } from "vitest";
import { lieferscheinDokument, rechnungDokument } from "./beleg.js";

describe("Belegdokumente", () => {
  it("Lieferschein hat keine Preise", () => {
    const d = lieferscheinDokument({
      nummer: "LS-1", datum: new Date("2026-06-22"), empfaenger: ["Muster GmbH"],
      positionen: [{ menge: 5, bezeichnung: "Poloshirt" }],
    });
    expect(d.typ).toBe("LIEFERSCHEIN");
    expect(d.zeigePreise).toBe(false);
    expect(d.summen).toHaveLength(0);
    expect(d.positionen[0]?.einzelpreis).toBeUndefined();
    expect(d.datum).toBe("22.06.2026");
  });

  it("Rechnung formatiert Einzel-/Zeilenpreise und Summen", () => {
    const d = rechnungDokument({
      nummer: "RE-1", datum: new Date("2026-06-22"), empfaenger: ["Muster GmbH"],
      positionen: [{ menge: 3, bezeichnung: "Cap", einzelpreisCents: 1000 }],
      netCents: 3000, taxCents: 570, grossCents: 3570,
    });
    expect(d.zeigePreise).toBe(true);
    expect(d.positionen[0]?.einzelpreis).toContain("10,00");
    expect(d.positionen[0]?.gesamt).toContain("30,00");
    expect(d.summen.find((s) => s.label === "Brutto")?.value).toContain("35,70");
  });
});
