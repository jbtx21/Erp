import { describe, expect, it } from "vitest";
import { buildShopPricePush, buildShopStatusUpdate } from "./shop-sync.js";
import type { VariantForPush } from "./shop-sync.js";

describe("Preis-Push ERP → Shop (T-08)", () => {
  const variants: VariantForPush[] = [
    {
      externalRef: "SKU-1",
      prices: [
        { priceGroup: "STANDARD", netCents: 1990 },
        { priceGroup: "WIEDERVERKAEUFER", netCents: 1490 },
      ],
    },
    { externalRef: "SKU-2", prices: [{ priceGroup: "STANDARD", netCents: 990 }] },
  ];

  it("pusht den VK der Preisgruppe der Firma", () => {
    const { updates, missing } = buildShopPricePush(variants, "WIEDERVERKAEUFER");
    expect(missing).toEqual(["SKU-2"]);
    expect(updates).toEqual([{ externalRef: "SKU-1", netCents: 1490 }]);
  });

  it("meldet fehlende Preise statt still zu überspringen", () => {
    const { updates, missing } = buildShopPricePush(variants, "AGENTUR");
    expect(updates).toHaveLength(0);
    expect(missing).toEqual(["SKU-1", "SKU-2"]);
  });
});

describe("Status-/Tracking-Push ERP → Shop (T-09)", () => {
  it("mappt Auftragsstatus auf Woo-Status", () => {
    expect(buildShopStatusUpdate({ externalOrderNumber: "100", status: "IN_PRODUKTION" }).status).toBe(
      "on-hold"
    );
    expect(buildShopStatusUpdate({ externalOrderNumber: "100", status: "STORNIERT" }).status).toBe(
      "cancelled"
    );
  });

  it("hängt Tracking nur bei VERSENDET an", () => {
    const versendet = buildShopStatusUpdate({
      externalOrderNumber: "100",
      status: "VERSENDET",
      trackingNumber: "DPD123",
    });
    expect(versendet).toEqual({
      externalOrderNumber: "100",
      status: "completed",
      trackingNumber: "DPD123",
    });

    const inProd = buildShopStatusUpdate({
      externalOrderNumber: "100",
      status: "IN_PRODUKTION",
      trackingNumber: "DPD123",
    });
    expect(inProd.trackingNumber).toBeUndefined();
  });
});
