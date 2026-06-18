import { describe, expect, it } from "vitest";
import { checkApproval, type ApprovalThresholds } from "./approval.js";

const set: ApprovalThresholds = { maxDiscountPct: 10, maxOrderValueCents: 500000 };
const unset: ApprovalThresholds = { maxDiscountPct: null, maxOrderValueCents: null };

describe("Freigabeschwellen (K-10, Kap. 12.1)", () => {
  it("greift nicht, solange keine Schwelle gepflegt ist", () => {
    const r = checkApproval({ orderValueCents: 9999999, discountPct: 99 }, unset);
    expect(r).toEqual({ required: false, reasons: [], configured: false });
  });

  it("verlangt Freigabe bei Rabatt über Schwelle", () => {
    const r = checkApproval({ orderValueCents: 1000, discountPct: 15 }, set);
    expect(r.required).toBe(true);
    expect(r.reasons).toContain("RABATT_UEBER_SCHWELLE");
  });

  it("verlangt Freigabe bei Auftragswert über Schwelle", () => {
    const r = checkApproval({ orderValueCents: 600000, discountPct: 0 }, set);
    expect(r.reasons).toEqual(["AUFTRAGSWERT_UEBER_SCHWELLE"]);
  });

  it("keine Freigabe innerhalb der Schwellen (aber konfiguriert)", () => {
    const r = checkApproval({ orderValueCents: 100000, discountPct: 5 }, set);
    expect(r).toEqual({ required: false, reasons: [], configured: true });
  });
});
