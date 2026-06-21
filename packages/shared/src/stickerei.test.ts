import { describe, expect, it } from "vitest";
import {
  computeStickereiStaffelVks,
  decideStickereiRoute,
  planStickerei,
  stickereiPriceForMenge,
  stickereiTotalForMenge,
  type StickereiStaffel,
} from "./stickerei.js";

describe("Stickerei-Partnerlogik (Kap. 5.4)", () => {
  it("Wiederholer mit Partner + Stickdatei → Direktauftrag", () => {
    expect(
      decideStickereiRoute({ stickereiPartnerId: "p-1", hatStickdatei: true })
    ).toBe("DIREKT");
  });

  it("neues Logo (keine Stickdatei) → Ausschreibung", () => {
    expect(
      decideStickereiRoute({ stickereiPartnerId: "p-1", hatStickdatei: false })
    ).toBe("AUSSCHREIBUNG");
  });

  it("kein Partner hinterlegt → Ausschreibung", () => {
    expect(
      decideStickereiRoute({ stickereiPartnerId: null, hatStickdatei: true })
    ).toBe("AUSSCHREIBUNG");
  });
});

describe("Stickerei-Tiefe: Punch + Digitalisierung (Kap. 5.4)", () => {
  it("planStickerei: Direktauftrag ohne Digitalisierung beim Wiederholer", () => {
    expect(planStickerei({ stickereiPartnerId: "p-1", hatStickdatei: true })).toMatchObject({
      route: "DIREKT",
      needsDigitizing: false,
    });
  });

  it("planStickerei: neues Logo braucht Digitalisierung + Ausschreibung", () => {
    const plan = planStickerei({ stickereiPartnerId: "p-1", hatStickdatei: false });
    expect(plan).toMatchObject({ route: "AUSSCHREIBUNG", needsDigitizing: true });
    expect(plan.reason).toMatch(/Digitalisierung/);
  });
});

describe("Stickerei — variable Mengenstaffeln je Logo (Kap. 4.4 / T-15)", () => {
  // Frei wählbare Staffeln, je Logo abweichend; Stick-EK manuell, VK = EK × 1,88.
  const staffeln: StickereiStaffel[] = [
    { minMenge: 100, ekCents: 500 },
    { minMenge: 1, ekCents: 1_000 },
    { minMenge: 50, ekCents: 600 },
    { minMenge: 10, ekCents: 800 },
  ];

  it("computeStickereiStaffelVks: sortiert + VK = EK × 1,88 (gerundet) + DB", () => {
    const vks = computeStickereiStaffelVks(staffeln);
    expect(vks.map((s) => s.minMenge)).toEqual([1, 10, 50, 100]); // aufsteigend
    expect(vks[0]).toMatchObject({ minMenge: 1, ekCents: 1_000, vkCents: 1_880, dbCents: 880 });
    expect(vks[1]).toMatchObject({ ekCents: 800, vkCents: 1_504, dbCents: 704 }); // round(1504)
    expect(vks[3]).toMatchObject({ minMenge: 100, ekCents: 500, vkCents: 940, dbCents: 440 });
  });

  it("computeStickereiStaffelVks: eigener Aufschlagsfaktor je Logo möglich", () => {
    const [s] = computeStickereiStaffelVks([{ minMenge: 1, ekCents: 1_000 }], 2.0);
    expect(s).toMatchObject({ vkCents: 2_000, dbCents: 1_000 });
  });

  it("stickereiPriceForMenge: höchste Staffel ≤ Menge (degressiv)", () => {
    expect(stickereiPriceForMenge(staffeln, 1)?.ekCents).toBe(1_000);
    expect(stickereiPriceForMenge(staffeln, 9)?.minMenge).toBe(1);
    expect(stickereiPriceForMenge(staffeln, 10)?.ekCents).toBe(800);
    expect(stickereiPriceForMenge(staffeln, 75)?.minMenge).toBe(50);
    expect(stickereiPriceForMenge(staffeln, 100)?.ekCents).toBe(500);
    expect(stickereiPriceForMenge(staffeln, 250)?.minMenge).toBe(100);
  });

  it("stickereiPriceForMenge: keine Staffel unter der kleinsten Grenze", () => {
    expect(stickereiPriceForMenge([{ minMenge: 10, ekCents: 800 }], 5)).toBeNull();
    expect(stickereiPriceForMenge(staffeln, 0)).toBeNull();
  });

  it("stickereiTotalForMenge: rechnet die gültige Staffel auf die Menge hoch", () => {
    const t = stickereiTotalForMenge(staffeln, 50);
    expect(t).toMatchObject({
      menge: 50,
      ekGesamtCents: 30_000, // 600 × 50
      vkGesamtCents: 56_400, // 1128 × 50
      dbGesamtCents: 26_400,
    });
    expect(t?.staffel.minMenge).toBe(50);
  });

  it("konfigurierbarer Aufschlag: Faktor je Stufe aufgelöst (Menge/EK-Regeln)", () => {
    // Default 1,88; kleine Mengen (≤ 9 Stück) mit 2,1.
    const markup = {
      config: { defaultFactor: 1.88, rules: [{ factor: 2.1, maxMenge: 9 }] },
    };
    const vks = computeStickereiStaffelVks(
      [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 600 }],
      markup
    );
    expect(vks[0]).toMatchObject({ minMenge: 1, vkCents: 2_100 }); // 1000 × 2,1 (kleine Menge)
    expect(vks[1]).toMatchObject({ minMenge: 50, vkCents: 1_128 }); // 600 × 1,88 (Default)
  });

  it("konfigurierbarer Aufschlag: Logo-Override gewinnt über alle Stufen", () => {
    const markup = { config: { defaultFactor: 1.88, rules: [] }, logoOverride: 2.0 };
    const t = stickereiTotalForMenge([{ minMenge: 1, ekCents: 500 }], 10, markup);
    expect(t?.staffel.vkCents).toBe(1_000); // 500 × 2,0
  });

  it("Validierung: ganze Staffelgrenze ≥ 1, kein EK < 0, keine Dubletten", () => {
    expect(() => computeStickereiStaffelVks([{ minMenge: 0, ekCents: 100 }])).toThrow(/≥ 1/);
    expect(() => computeStickereiStaffelVks([{ minMenge: 1.5, ekCents: 100 }])).toThrow(/ganze Zahl/);
    expect(() => computeStickereiStaffelVks([{ minMenge: 1, ekCents: -1 }])).toThrow(/negativ/);
    expect(() =>
      computeStickereiStaffelVks([{ minMenge: 10, ekCents: 100 }, { minMenge: 10, ekCents: 200 }])
    ).toThrow(/Doppelte Staffelgrenze/);
  });
});
