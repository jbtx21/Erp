import { describe, expect, it } from "vitest";
import { toCsv, toXlsxAoa } from "./export.js";

describe("toXlsxAoa (Formula-Injection-Schutz, Kap. 28)", () => {
  it("entschärft String-Zellen mit führendem = + - @ und lässt echte Zahlen unangetastet", () => {
    const aoa = toXlsxAoa(
      ["Artikel", "Bestellwert"],
      [
        ["=HYPERLINK(\"http://evil\")", 1234],
        ["+SUM(A1)", -50],
        ["@cmd", 0],
        ["-5+cmd", 7],
      ],
    );
    // Kopfzeile bleibt Text.
    expect(aoa[0]).toEqual(["Artikel", "Bestellwert"]);
    // Gefährliche Präfixe werden mit ' entschärft.
    expect(aoa[1]![0]).toBe("'=HYPERLINK(\"http://evil\")");
    expect(aoa[2]![0]).toBe("'+SUM(A1)");
    expect(aoa[3]![0]).toBe("'@cmd");
    expect(aoa[4]![0]).toBe("'-5+cmd"); // führendes '-' mit Nicht-Zahl → entschärft
    // Zahlen bleiben echte Number-Zellen (auch negativ), nicht als Formel interpretierbar.
    expect(aoa[1]![1]).toBe(1234);
    expect(aoa[2]![1]).toBe(-50);
    expect(aoa[3]![1]).toBe(0);
  });

  it("belässt harmlose Texte und negative Zahl-Strings unverändert (Parität zum CSV)", () => {
    const aoa = toXlsxAoa(["A"], [["Polo Shirt"], ["-12,50"]]);
    expect(aoa[1]![0]).toBe("Polo Shirt");
    expect(aoa[2]![0]).toBe("-12,50"); // reine (negative) Zahl → keine Entschärfung
    // Gegenprobe: CSV neutralisiert identisch.
    expect(toCsv(["A"], [["=1+1"]])).toContain("'=1+1");
  });
});
