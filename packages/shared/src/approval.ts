// Freigabeschwellen — Kap. 12.1. Klärung K-10.
// Schwellen (Rabatt-% und Auftragswert) sind konfigurierbar und werden erst im
// Geschäftsleitungs-Workshop gesetzt. Solange nicht konfiguriert, kann das Gate
// nicht greifen (configured=false) — das wird sichtbar gemacht, nicht still ignoriert.

import type { Cents } from "./money.js";

export interface ApprovalThresholds {
  /** Rabatt-% (0..100), ab dem GL-Freigabe nötig ist. null = nicht definiert. */
  maxDiscountPct: number | null;
  /** Auftragswert (netto, Cent), ab dem GL-Freigabe nötig ist. null = nicht definiert. */
  maxOrderValueCents: Cents | null;
}

export type ApprovalReason = "RABATT_UEBER_SCHWELLE" | "AUFTRAGSWERT_UEBER_SCHWELLE";

export interface ApprovalCheck {
  orderValueCents: Cents;
  discountPct: number;
}

export interface ApprovalResult {
  required: boolean;
  reasons: ApprovalReason[];
  /** false, solange keine Schwelle gepflegt ist (K-10 offen). */
  configured: boolean;
}

/**
 * Prüft, ob ein Auftrag die Freigabe der Geschäftsleitung braucht (Kap. 12.1).
 * Greift nur gegen gepflegte Schwellen; fehlt eine Schwelle, fließt sie nicht ein.
 */
export function checkApproval(
  input: ApprovalCheck,
  thresholds: ApprovalThresholds
): ApprovalResult {
  const reasons: ApprovalReason[] = [];
  const configured =
    thresholds.maxDiscountPct != null || thresholds.maxOrderValueCents != null;

  if (thresholds.maxDiscountPct != null && input.discountPct > thresholds.maxDiscountPct) {
    reasons.push("RABATT_UEBER_SCHWELLE");
  }
  if (
    thresholds.maxOrderValueCents != null &&
    input.orderValueCents > thresholds.maxOrderValueCents
  ) {
    reasons.push("AUFTRAGSWERT_UEBER_SCHWELLE");
  }

  return { required: reasons.length > 0, reasons, configured };
}
