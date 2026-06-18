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
  it("DIREKT nur bei Partner UND Stickdatei", async () => {
    expect((await service().routeForCompany("direkt")).route).toBe("DIREKT");
  });

  it("AUSSCHREIBUNG ohne Stickdatei oder ohne Partner", async () => {
    expect((await service().routeForCompany("ohne_datei")).route).toBe("AUSSCHREIBUNG");
    expect((await service().routeForCompany("neu")).route).toBe("AUSSCHREIBUNG");
  });

  it("wirft für eine unbekannte Firma", async () => {
    await expect(service().routeForCompany("x")).rejects.toThrow(/nicht gefunden/);
  });
});
