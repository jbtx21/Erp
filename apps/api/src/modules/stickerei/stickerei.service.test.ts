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
