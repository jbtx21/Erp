import { describe, expect, it } from "vitest";
import { kundenStammblatt, lieferantenStammblatt } from "./stammblatt.js";

const baseKunde = {
  name: "ACME GmbH", customerNumber: "KD-2026-0007", priceGroupKind: "STANDARD", branche: "Industrie",
  street: "Weg 1", zip: "45000", city: "Essen", country: "DE",
  vatId: "DE123456789", taxNumber: null, taxRule: "EU_B2B",
  iban: "DE00", bic: null, bankName: "Sparkasse", sepaMandateRef: "M-1", sepaMandateDate: "2026-01-01",
  zahlungszielTage: 30, skontoPercent: 2, skontoDays: 10, paymentMethod: "UEBERWEISUNG", kreditlimitCents: 500000,
  liefersperre: true, liefersperreGrund: "offene Posten", debitorenkonto: "10007", belegsprache: "DE", waehrung: "EUR", betreuer: "M. Maier",
  datum: new Date("2026-06-26T00:00:00Z"),
};

describe("kundenStammblatt", () => {
  it("baut Sektionen mit formatierten Werten und sprechender Nummer", () => {
    const b = kundenStammblatt(baseKunde);
    expect(b.titel).toBe("Kundenstammblatt");
    expect(b.nummer).toBe("KD-2026-0007");
    const steuer = b.sektionen.find((s) => s.titel === "Steuer")!;
    expect(steuer.felder.find((f) => f.label === "Steuerregel")!.wert).toContain("EU");
    const kond = b.sektionen.find((s) => s.titel === "Konditionen")!;
    expect(kond.felder.find((f) => f.label === "Skonto")!.wert).toBe("2 % / 10 Tage");
    expect(kond.felder.find((f) => f.label === "Kreditlimit")!.wert).toContain("5.000");
    const sperren = b.sektionen.find((s) => s.titel === "Sperren")!;
    expect(sperren.felder[0]!.wert).toContain("offene Posten");
  });

  it("lässt leere Felder/Sektionen weg (kompakt)", () => {
    const b = kundenStammblatt({ ...baseKunde, liefersperre: false, liefersperreGrund: null });
    expect(b.sektionen.find((s) => s.titel === "Sperren")).toBeUndefined();
  });
});

describe("lieferantenStammblatt", () => {
  it("baut ein Lieferanten-Datenblatt mit Katalog-Anzahl", () => {
    const b = lieferantenStammblatt({
      name: "FHB", kind: "MANUAL", street: null, zip: null, city: null, country: "DE",
      vatId: "DE999", iban: null, bic: null, zahlungszielTage: 14, skontoPercent: null, skontoDays: null,
      lieferzeitTage: 5, notiz: null, itemCount: 42, datum: new Date("2026-06-26T00:00:00Z"),
    });
    expect(b.titel).toBe("Lieferantenstammblatt");
    expect(b.nummer).toBeNull();
    const allg = b.sektionen.find((s) => s.titel === "Allgemein")!;
    expect(allg.felder.find((f) => f.label === "Katalog-Artikel")!.wert).toBe("42");
  });
});
