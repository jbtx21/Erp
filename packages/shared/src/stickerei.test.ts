import { describe, expect, it } from "vitest";
import {
  compareStickereiOffers,
  decideStickereiRoute,
  planStickerei,
  stickereiCostCents,
  type StickereiOffer,
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

describe("Stickerei-Tiefe: Punch, Stichkosten, Angebotsvergleich (Kap. 5.4)", () => {
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

  it("stickereiCostCents: Einrichtung + aufgerundete Tausender-Stiche", () => {
    const offer: StickereiOffer = { partnerId: "p", name: "P", setupCents: 1_500, pricePer1000Cents: 200, leadDays: 5 };
    // 8200 Stiche → ceil(8.2)=9 → 1500 + 9*200 = 3300
    expect(stickereiCostCents(8_200, offer)).toBe(3_300);
  });

  it("compareStickereiOffers: günstigstes zuerst, Gleichstand nach Durchlaufzeit", () => {
    const offers: StickereiOffer[] = [
      { partnerId: "a", name: "A", setupCents: 2_000, pricePer1000Cents: 200, leadDays: 7 },
      { partnerId: "b", name: "B", setupCents: 1_000, pricePer1000Cents: 250, leadDays: 5 },
    ];
    // 10.000 Stiche: A = 2000+10*200=4000; B = 1000+10*250=3500 → B günstiger.
    const cmp = compareStickereiOffers(10_000, offers);
    expect(cmp.chosen?.partnerId).toBe("b");
    expect(cmp.quotes.map((q) => q.partnerId)).toEqual(["b", "a"]);
    expect(cmp.quotes[0]?.totalCents).toBe(3_500);
  });
});
