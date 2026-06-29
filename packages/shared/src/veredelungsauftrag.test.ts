import { describe, expect, it } from "vitest";
import { buildBeistellMatrix, detectVeredelungsarten, sortSizes, veredelungsauftragDokument } from "./veredelungsauftrag.js";

describe("veredelungsauftrag (Werkstattblatt-Aufbereitung)", () => {
  it("sortiert Größen fachlich (XS<S<M<…), Unbekanntes hinten", () => {
    expect(sortSizes(["XL", "S", "M", "XS", "XXL"])).toEqual(["XS", "S", "M", "XL", "XXL"]);
    expect(sortSizes(["L", "Onesize", "M"])).toEqual(["M", "L", "Onesize"]);
  });

  it("aggregiert Textilzeilen (je Größe) zur Artikel×Größe-Matrix mit Gesamtsummen", () => {
    const { groessen, matrix, gesamt } = buildBeistellMatrix([
      { position: 1, artNr: "816", bezeichnung: "Poloshirt", farbe: "Rot", groesse: "M", menge: 10 },
      { position: 2, artNr: "816", bezeichnung: "Poloshirt", farbe: "Rot", groesse: "L", menge: 15 },
      { position: 3, artNr: "816", bezeichnung: "Poloshirt", farbe: "Blau", groesse: "M", menge: 5 },
    ]);
    expect(groessen).toEqual(["M", "L"]);
    expect(matrix).toHaveLength(2); // Rot + Blau getrennt
    const rot = matrix.find((r) => r.farbe === "Rot")!;
    expect(rot.mengen).toEqual({ M: 10, L: 15 });
    expect(rot.gesamt).toBe(25);
    expect(gesamt).toBe(30);
  });

  it("erkennt Veredelungsarten aus den Motivtexten", () => {
    const f = detectVeredelungsarten([
      { description: "Logo Brust links, 2-farbig Siebdruck", bezugPosition: 1 },
      { description: "Rückenstick groß", bezugPosition: 1 },
    ]);
    expect(f.bedruckt).toBe(true);
    expect(f.bestickt).toBe(true);
    expect(f.transfer).toBe(false);
  });

  it("reicht die Karten-Detailfelder je Veredelungsposition durch (Motiv/Größe/Farbton/Platzierungsdetails/Sonstiges/Menge)", () => {
    const doc = veredelungsauftragDokument({
      nummer: "56827", datum: new Date("2026-06-22"), veredler: "Stickerei Maurer", kunde: "Autohaus Weeber GmbH",
      textilien: [{ position: 1, artNr: "6666112010W43445", bezeichnung: "Greiff Hemd", farbe: "schwarz", groesse: "44", menge: 5 }],
      motive: [{ description: "Logo", bezugPosition: 1, platzierung: "Brust rechts", motiv: "Logo Autohaus Weeber", menge: 5, motivGroesse: "8 x 2 cm", farbton: "1918 helleres Grau", platzierungsdetails: "Brust rechts", sonstiges: "= S. Beer" }],
    });
    const p = doc.positionen[0]!;
    expect(p.motiv).toBe("Logo Autohaus Weeber");
    expect(p.menge).toBe(5);
    expect(p.motivGroesse).toBe("8 x 2 cm");
    expect(p.platzierungsdetails).toBe("Brust rechts");
    expect(p.sonstiges).toBe("= S. Beer");
  });

  it("markiert Inhouse, wenn kein Veredler gesetzt ist", () => {
    const doc = veredelungsauftragDokument({
      nummer: "PA-1-b", datum: new Date("2026-06-01"), veredler: null, kunde: "Muster GmbH",
      textilien: [{ position: 1, artNr: "816", bezeichnung: "Polo", farbe: "Rot", groesse: "M", menge: 3 }],
      motive: [{ description: "Transferdruck Brust", bezugPosition: 1 }],
    });
    expect(doc.inhouse).toBe(true);
    expect(doc.veredler).toBe("Inhouse-Veredelung");
    expect(doc.arten.transfer).toBe(true);
    expect(doc.beistellGesamt).toBe(3);
  });
});
