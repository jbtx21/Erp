import { describe, expect, it } from "vitest";
import { konto, erloeskonto, kontenliste, kontoLabel, KONTEN } from "./kontenrahmen.js";

describe("Kontenrahmen SKR03/SKR04", () => {
  it("liefert je Rahmen die richtige Kontonummer", () => {
    expect(konto("SKR03", "erloese19")).toBe("8400");
    expect(konto("SKR04", "erloese19")).toBe("4400");
    expect(konto("SKR03", "wareneingang")).toBe("3200");
    expect(konto("SKR04", "wareneingang")).toBe("5200");
  });

  it("wählt das Erlöskonto nach USt-Satz", () => {
    expect(erloeskonto("SKR03", 0.19)).toBe("8400");
    expect(erloeskonto("SKR03", 0.07)).toBe("8300");
    expect(erloeskonto("SKR04", 0.19)).toBe("4400");
    expect(erloeskonto("SKR03", 0)).toBe("8120"); // steuerfrei
  });

  it("liefert eine vollständige Kontenliste je Rahmen", () => {
    const skr03 = kontenliste("SKR03");
    expect(skr03).toHaveLength(KONTEN.length);
    expect(skr03.every((k) => /^\d{4}$/.test(k.nummer))).toBe(true);
    expect(kontenliste("SKR04").find((k) => k.key === "kreditoren")?.nummer).toBe("3300");
  });

  it("kennt Kontobezeichnungen", () => {
    expect(kontoLabel("vorsteuer")).toMatch(/Vorsteuer/);
  });
});
