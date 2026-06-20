// Stickerei-Partnerwahl (Kap. 5.4): Direktauftrag nur bei Partner + Stickdatei.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { InMemoryStickereiRepository } from "../../repositories/in-memory-stickerei.repository.js";
import { StickereiService } from "./stickerei.service.js";

function service() {
  return new StickereiService(
    new InMemoryStickereiRepository(
      {
        direkt: { stickereiPartnerId: "sup", hatStickdatei: true },
        ohne_datei: { stickereiPartnerId: "sup", hatStickdatei: false },
        neu: { stickereiPartnerId: null, hatStickdatei: false },
      },
      { "logo-1": [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 600 }] }
    )
  );
}

describe("StickereiService.routeForCompany (Kap. 5.4)", () => {
  it("DIREKT ohne Digitalisierung bei Partner UND Stickdatei", async () => {
    const res = await service().routeForCompany("direkt");
    expect(res).toMatchObject({ route: "DIREKT", needsDigitizing: false });
  });

  it("AUSSCHREIBUNG + Digitalisierung ohne Stickdatei; AUSSCHREIBUNG ohne Partner", async () => {
    const ohneDatei = await service().routeForCompany("ohne_datei");
    expect(ohneDatei).toMatchObject({ route: "AUSSCHREIBUNG", needsDigitizing: true });
    expect((await service().routeForCompany("neu")).route).toBe("AUSSCHREIBUNG");
  });

  it("wirft für eine unbekannte Firma", async () => {
    await expect(service().routeForCompany("x")).rejects.toThrow(/nicht gefunden/);
  });
});

describe("StickereiService Mengenstaffeln je Logo (Kap. 4.4 / T-15)", () => {
  it("listStaffeln: sortiert + VK = EK × 1,88 je Stufe", async () => {
    const res = await service().listStaffeln("logo-1");
    expect(res.staffeln.map((s) => s.minMenge)).toEqual([1, 50]);
    expect(res.staffeln[0]).toMatchObject({ ekCents: 1_000, vkCents: 1_880 });
  });

  it("saveStaffeln: ersetzt die Staffeln (Set-Semantik) und gibt VKs zurück", async () => {
    const svc = service();
    const saved = await svc.saveStaffeln("logo-1", [{ minMenge: 1, ekCents: 500 }, { minMenge: 100, ekCents: 400 }]);
    expect(saved.staffeln.map((s) => s.minMenge)).toEqual([1, 100]);
    const reloaded = await svc.listStaffeln("logo-1");
    expect(reloaded.staffeln.map((s) => s.ekCents)).toEqual([500, 400]);
  });

  it("saveStaffeln: lehnt ungültige Eingabe ab (Dubletten/minMenge<1)", async () => {
    await expect(
      service().saveStaffeln("logo-1", [{ minMenge: 1, ekCents: 100 }, { minMenge: 1, ekCents: 200 }])
    ).rejects.toThrow(/Doppelte Staffelgrenze/);
  });

  it("priceForMenge: höchste Staffel ≤ Menge", async () => {
    expect((await service().priceForMenge("logo-1", 75))?.minMenge).toBe(50);
    expect(await service().priceForMenge("logo-1", 0)).toBeNull();
  });
});

describe("StickereiService konfigurierbarer Aufschlagsfaktor (Kap. 4.4)", () => {
  function svc() {
    return new StickereiService(
      new InMemoryStickereiRepository(
        {},
        { "logo-2": [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 1_000 }] },
        {
          markupConfig: { defaultFactor: 1.88, rules: [{ id: "klein", factor: 2.1, maxMenge: 9 }] },
          logoOverrides: { "logo-ov": 2.0 },
          priceGroups: { "logo-2": "STD" },
        }
      )
    );
  }

  it("listStaffeln: Regel je Stufe (kleine Mengen anderer Faktor)", async () => {
    const res = await svc().listStaffeln("logo-2");
    expect(res.staffeln[0]).toMatchObject({ minMenge: 1, vkCents: 2_100 }); // 1000 × 2,1 (≤9)
    expect(res.staffeln[1]).toMatchObject({ minMenge: 50, vkCents: 1_880 }); // 1000 × 1,88 (Default)
    expect(res.priceGroupId).toBe("STD");
  });

  it("getMarkupConfig/saveMarkupConfig: Roundtrip + Validierung", async () => {
    const s = svc();
    const saved = await s.saveMarkupConfig({ defaultFactor: 1.7, rules: [{ factor: 2.0, priceGroupId: "VIP" }] });
    expect(saved.defaultFactor).toBe(1.7);
    expect((await s.getMarkupConfig()).rules[0]).toMatchObject({ factor: 2.0, priceGroupId: "VIP" });
    await expect(s.saveMarkupConfig({ defaultFactor: 0, rules: [] })).rejects.toThrow(/> 0/);
  });

  it("Logo-Override gewinnt über die globalen Regeln", async () => {
    const s = svc();
    await s.saveStaffeln("logo-ov", [{ minMenge: 1, ekCents: 1_000 }], 2.0);
    const res = await s.listStaffeln("logo-ov");
    expect(res.logoOverride).toBe(2.0);
    expect(res.staffeln[0]?.vkCents).toBe(2_000); // 1000 × 2,0 (Override, nicht 2,1-Regel)
  });
});
