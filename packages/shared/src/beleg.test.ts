import { describe, expect, it } from "vitest";
import { angebotDokument, auftragsbestaetigungDokument, laufzettelDokument, lieferscheinDokument, rechnungDokument } from "./beleg.js";

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

describe("Briefkopf (Admin-Portal) im Beleg", () => {
  it("nutzt den konfigurierten Absender statt des Defaults", () => {
    const d = lieferscheinDokument({ nummer: "LS-1", datum: new Date("2026-06-22"), empfaenger: ["X"], positionen: [{ menge: 1, bezeichnung: "Y" }], absender: ["Meine Firma", "Meine Str. 1"] });
    expect(d.absender).toEqual(["Meine Firma", "Meine Str. 1"]);
  });
  it("fällt ohne Konfiguration auf den TEXMA-Default zurück", () => {
    const d = lieferscheinDokument({ nummer: "LS-1", datum: new Date("2026-06-22"), empfaenger: ["X"], positionen: [{ menge: 1, bezeichnung: "Y" }] });
    expect(d.absender[0]).toContain("TEXMA");
  });
});

describe("Angebot / Auftragsbestätigung", () => {
  const pos = [{ menge: 10, bezeichnung: "Poloshirt + Stick", einzelpreisCents: 1990 }];
  it("Angebot mit Preisen, Bindefrist und AGB-Hinweis", () => {
    const d = angebotDokument({
      nummer: "AN-2026-0001", datum: new Date("2026-06-22"), empfaenger: ["Muster GmbH"],
      positionen: pos, netCents: 19900, taxCents: 3781, grossCents: 23681, gueltigBis: new Date("2026-07-22"),
    });
    expect(d.typ).toBe("ANGEBOT");
    expect(d.zeigePreise).toBe(true);
    expect(d.positionen[0]?.gesamt).toBeTruthy();
    expect(d.summen.find((s) => s.label === "Brutto")?.value).toBeTruthy();
    expect(d.hinweise.some((h) => h.includes("gültig bis"))).toBe(true);
    expect(d.hinweise.some((h) => h.includes("Geschäftsbedingungen"))).toBe(true);
  });

  it("Auftragsbestätigung mit Liefertermin und Bestellbezug", () => {
    const d = auftragsbestaetigungDokument({
      nummer: "AB-2026-0007", datum: new Date("2026-06-22"), empfaenger: ["Muster GmbH"],
      positionen: pos, netCents: 19900, taxCents: 3781, grossCents: 23681,
      liefertermin: new Date("2026-07-01"), bestellreferenz: "WC-1234",
    });
    expect(d.typ).toBe("AUFTRAGSBESTAETIGUNG");
    expect(d.hinweise.some((h) => h.includes("WC-1234"))).toBe(true);
    expect(d.hinweise.some((h) => h.includes("Liefertermin"))).toBe(true);
  });
});

describe("Laufzettel / Produktionszettel", () => {
  it("ohne Preise, Positionsart vorangestellt, Route + Hinweise", () => {
    const d = laufzettelDokument({
      nummer: "AB-1", datum: new Date("2026-06-22"), kunde: "Muster GmbH", routeLabel: "Route 2 – interne Veredelung",
      positionen: [{ menge: 100, bezeichnung: "Polo", kind: "TEXTIL" }, { menge: 100, bezeichnung: "Stick Brust", kind: "VEREDELUNG" }],
    });
    expect(d.typ).toBe("LAUFZETTEL");
    expect(d.zeigePreise).toBe(false);
    expect(d.positionen[1]?.bezeichnung).toContain("[Veredelung]");
    expect(d.empfaenger.some((l) => l.includes("Route 2"))).toBe(true);
    expect(d.hinweise.some((h) => h.includes("Druckfreigabe"))).toBe(true);
  });
});
