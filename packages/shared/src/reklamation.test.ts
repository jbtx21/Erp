import { describe, expect, it } from "vitest";
import {
  allocateComplaintCost,
  costBearer,
  validateFollowUp,
  type ComplaintInput,
} from "./reklamation.js";

const base: ComplaintInput = {
  orderId: "o-1",
  orderLineId: "l-1",
  cause: "LIEFERANT",
  followUp: "NACHPRODUKTION",
  costCents: 5000,
};

describe("Reklamation / Workflow C (Kap. 20)", () => {
  it("ordnet Kosten dem Verursacher zu", () => {
    expect(costBearer("LIEFERANT")).toBe("LIEFERANT");
    expect(costBearer("EXTERN_VEREDLER")).toBe("VEREDLER");
    expect(costBearer("INTERN")).toBe("TEXMA");
    expect(allocateComplaintCost(base)).toEqual({ bearer: "LIEFERANT", amountCents: 5000 });
  });

  it("meldet Nachproduktion ohne Kostenansatz", () => {
    expect(validateFollowUp({ ...base, costCents: 0 })).toContain(
      "Nachproduktion ohne Kostenansatz."
    );
  });

  it("meldet Kosten ohne Folgevorgang", () => {
    expect(validateFollowUp({ ...base, followUp: "KEINE", costCents: 100 })).toContain(
      "Kosten ohne Folgevorgang erfasst."
    );
  });

  it("akzeptiert eine plausible Gutschrift", () => {
    expect(
      validateFollowUp({ ...base, followUp: "GUTSCHRIFT", costCents: 5000 })
    ).toHaveLength(0);
  });
});
