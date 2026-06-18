import { describe, expect, it } from "vitest";
import {
  buildDpdLabelRequest,
  ShippingValidationError,
  type ShippingAddress,
} from "./shipping.js";

const recipient: ShippingAddress = {
  name: "Muster GmbH",
  street: "Hauptstr. 1",
  zip: "70173",
  city: "Stuttgart",
  country: "DE",
};

describe("DPD-Label (T-06)", () => {
  it("baut eine vollständige Label-Anfrage", () => {
    const req = buildDpdLabelRequest({
      orderNumber: "AB-2026-100",
      recipient,
      weightGrams: 2500,
    });
    expect(req).toEqual({
      reference: "AB-2026-100",
      recipient,
      weightGrams: 2500,
      parcelCount: 1,
    });
  });

  it("setzt Land-Default DE", () => {
    const req = buildDpdLabelRequest({
      orderNumber: "x",
      recipient: { ...recipient, country: "" },
      weightGrams: 100,
    });
    expect(req.recipient.country).toBe("DE");
  });

  it("lehnt unvollständige Adresse ab", () => {
    expect(() =>
      buildDpdLabelRequest({
        orderNumber: "x",
        recipient: { ...recipient, city: "" },
        weightGrams: 100,
      })
    ).toThrow(ShippingValidationError);
  });

  it("lehnt fehlendes Gewicht ab", () => {
    expect(() =>
      buildDpdLabelRequest({ orderNumber: "x", recipient, weightGrams: 0 })
    ).toThrow(/gewicht/i);
  });
});
