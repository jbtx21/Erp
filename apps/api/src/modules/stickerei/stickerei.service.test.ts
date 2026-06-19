// Stickerei-Partnerwahl (Kap. 5.4): Direktauftrag nur bei Partner + Stickdatei.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { InMemoryStickereiRepository } from "../../repositories/in-memory-stickerei.repository.js";
import { StickereiService } from "./stickerei.service.js";

function service() {
  return new StickereiService(
    new InMemoryStickereiRepository({
      direkt: { stickereiPartnerId: "sup", hatStickdatei: true },
      ohne_datei: { stickereiPartnerId: "sup", hatStickdatei: false },
      neu: { stickereiPartnerId: null, hatStickdatei: false },
    })
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

  it("vergleicht Ausschreibungs-Angebote nach Stichzahl", () => {
    const cmp = service().compareOffers(10_000, [
      { partnerId: "a", name: "A", setupCents: 2_000, pricePer1000Cents: 200, leadDays: 7 },
      { partnerId: "b", name: "B", setupCents: 1_000, pricePer1000Cents: 250, leadDays: 5 },
    ]);
    expect(cmp.chosen?.partnerId).toBe("b");
  });
});
