import { describe, expect, it } from "vitest";
import { decideStickereiRoute } from "./stickerei.js";

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
