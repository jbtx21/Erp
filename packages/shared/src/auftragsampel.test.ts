import { describe, expect, it } from "vitest";
import { computeAuftragsampel, type AuftragsampelInput } from "./auftragsampel.js";

const base: AuftragsampelInput = {
  status: "IN_BEARBEITUNG",
  today: new Date("2026-06-24T00:00:00Z"),
  liefertermin: new Date("2026-07-10T00:00:00Z"),
  lieferstatus: "NICHT",
  fakturastatus: "NICHT",
  openCents: null,
  grossCents: null,
  lines: [{ hasVariant: true, sufficient: true }],
  isEuForeignB2B: false,
  vatIdValid: false,
  produktion: "KEINE",
  freigegeben: true,
  liefersperre: false,
};

const lamp = (row: ReturnType<typeof computeAuftragsampel>, key: string): string =>
  row.checks.find((c) => c.key === key)!.lamp;

describe("computeAuftragsampel", () => {
  it("gesunder Auftrag in Zukunft → GRÜN (Freigabe erteilt, Bestand da)", () => {
    const r = computeAuftragsampel(base);
    expect(lamp(r, "bestand")).toBe("GRUEN");
    expect(lamp(r, "liefertermin")).toBe("GRUEN");
    expect(r.overall).toBe("GRUEN");
  });

  it("fehlender Bestand → ROT gesamt", () => {
    const r = computeAuftragsampel({ ...base, lines: [{ hasVariant: true, sufficient: false }] });
    expect(lamp(r, "bestand")).toBe("ROT");
    expect(r.overall).toBe("ROT");
  });

  it("überfälliger Liefertermin (nicht geliefert) → ROT", () => {
    const r = computeAuftragsampel({ ...base, liefertermin: new Date("2026-06-20T00:00:00Z") });
    expect(lamp(r, "liefertermin")).toBe("ROT");
    expect(r.overall).toBe("ROT");
  });

  it("nach Versand sind Fulfillment-Prüfungen erledigt (kein Versand-Block am Endstatus)", () => {
    // Fakturiert + bezahlt, aber Bestand/Liefertermin wären sonst ROT → nach Versand neutralisiert.
    const r = computeAuftragsampel({
      ...base, status: "FAKTURIERT", lieferstatus: "VOLL", fakturastatus: "VOLL",
      openCents: 0, grossCents: 10000,
      lines: [{ hasVariant: true, sufficient: false }],
      liefertermin: new Date("2026-06-20T00:00:00Z"),
    });
    expect(lamp(r, "bestand")).toBe("GRUEN");
    expect(lamp(r, "liefertermin")).toBe("GRUEN");
    expect(r.overall).toBe("GRUEN");
  });

  it("EU-Ausland-B2B ohne gültige USt-IdNr. → ROT", () => {
    const r = computeAuftragsampel({ ...base, isEuForeignB2B: true, vatIdValid: false });
    expect(lamp(r, "ustid")).toBe("ROT");
  });

  it("fakturiert, voll bezahlt → Zahlung GRÜN", () => {
    const r = computeAuftragsampel({ ...base, fakturastatus: "VOLL", openCents: 0, grossCents: 10000 });
    expect(lamp(r, "zahlung")).toBe("GRUEN");
    expect(lamp(r, "faktura")).toBe("GRUEN");
  });

  it("fakturiert, nichts bezahlt → Zahlung ROT", () => {
    const r = computeAuftragsampel({ ...base, fakturastatus: "VOLL", openCents: 10000, grossCents: 10000 });
    expect(lamp(r, "zahlung")).toBe("ROT");
  });

  it("Teilzahlung → GELB", () => {
    const r = computeAuftragsampel({ ...base, fakturastatus: "VOLL", openCents: 4000, grossCents: 10000 });
    expect(lamp(r, "zahlung")).toBe("GELB");
  });

  it("Freigabe ausstehend → GELB gesamt (kein Blocker rot)", () => {
    const r = computeAuftragsampel({ ...base, freigegeben: false });
    expect(lamp(r, "freigabe")).toBe("GELB");
    expect(r.overall).toBe("GELB");
  });

  it("aktive Liefersperre → ROT", () => {
    const r = computeAuftragsampel({ ...base, liefersperre: true });
    expect(lamp(r, "liefersperre")).toBe("ROT");
    expect(r.overall).toBe("ROT");
  });

  it("storniert → Gesamt ROT", () => {
    const r = computeAuftragsampel({ ...base, status: "STORNIERT" });
    expect(r.overall).toBe("ROT");
  });

  it("vollständig geliefert macht Liefertermin GRÜN trotz Vergangenheit", () => {
    const r = computeAuftragsampel({ ...base, lieferstatus: "VOLL", liefertermin: new Date("2026-06-01T00:00:00Z") });
    expect(lamp(r, "liefertermin")).toBe("GRUEN");
  });
});
