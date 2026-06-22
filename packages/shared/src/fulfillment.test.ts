import { describe, expect, it } from "vitest";
import { fulfillmentStatus } from "./fulfillment.js";

describe("fulfillmentStatus (G-4, Teil-Status)", () => {
  it("nichts erledigt → NICHT", () => expect(fulfillmentStatus(100, 0)).toBe("NICHT"));
  it("teilweise erledigt → TEILWEISE", () => expect(fulfillmentStatus(100, 40)).toBe("TEILWEISE"));
  it("vollständig erledigt → VOLL", () => expect(fulfillmentStatus(100, 100)).toBe("VOLL"));
  it("überfüllt → VOLL", () => expect(fulfillmentStatus(100, 130)).toBe("VOLL"));
  it("nichts zu erfüllen (total 0) → VOLL", () => expect(fulfillmentStatus(0, 0)).toBe("VOLL"));
  it("negatives done → NICHT", () => expect(fulfillmentStatus(100, -5)).toBe("NICHT"));
});
