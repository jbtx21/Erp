// Reklamation / Workflow C — Kap. 20.
// Eine Reklamation bezieht sich auf eine Auftragsposition, bekommt eine Ursache
// (Lieferant / intern / externer Veredler) und einen Folgevorgang. Die Kosten
// trägt der Verursacher — Grundlage für Lieferantenbewertung und DB-Korrektur.

import type { Cents } from "./money.js";

export type ComplaintCause = "LIEFERANT" | "INTERN" | "EXTERN_VEREDLER";

export type FollowUpType =
  | "NACHPRODUKTION"
  | "EXPRESS_NACHPRODUKTION"
  | "GUTSCHRIFT"
  | "KEINE";

export type CostBearer = "LIEFERANT" | "VEREDLER" | "TEXMA";

export interface ComplaintInput {
  orderId: string;
  orderLineId: string;
  cause: ComplaintCause;
  followUp: FollowUpType;
  costCents: Cents;
}

export interface CostAllocation {
  bearer: CostBearer;
  amountCents: Cents;
}

/** Wer trägt die Kosten der Reklamation (Kap. 20)? */
export function costBearer(cause: ComplaintCause): CostBearer {
  switch (cause) {
    case "LIEFERANT":
      return "LIEFERANT";
    case "EXTERN_VEREDLER":
      return "VEREDLER";
    case "INTERN":
      return "TEXMA";
  }
}

/** Ordnet die Reklamationskosten dem Verursacher zu. */
export function allocateComplaintCost(input: ComplaintInput): CostAllocation {
  return { bearer: costBearer(input.cause), amountCents: input.costCents };
}

export type FollowUpAction = "NONE" | "CREDIT_NOTE" | "REPRODUCTION";

/**
 * Klassifiziert den Folgevorgang (B11): Gutschrift → CreditNote, (Express-)
 * Nachproduktion → neuer Nachproduktions-Auftrag, sonst nichts.
 */
export function followUpAction(followUp: FollowUpType): {
  action: FollowUpAction;
  express: boolean;
} {
  switch (followUp) {
    case "GUTSCHRIFT":
      return { action: "CREDIT_NOTE", express: false };
    case "NACHPRODUKTION":
      return { action: "REPRODUCTION", express: false };
    case "EXPRESS_NACHPRODUKTION":
      return { action: "REPRODUCTION", express: true };
    case "KEINE":
      return { action: "NONE", express: false };
  }
}

/**
 * Validiert die Kombination aus Ursache und Folgevorgang. Eine Gutschrift bei
 * Lieferantenverschulden ist zulässig; eine Express-Nachproduktion ohne Kosten
 * ist unplausibel und wird gemeldet (hilft, Workflow C sauber zu erfassen).
 */
export function validateFollowUp(input: ComplaintInput): string[] {
  const problems: string[] = [];
  if (input.followUp === "KEINE" && input.costCents > 0) {
    problems.push("Kosten ohne Folgevorgang erfasst.");
  }
  if (
    (input.followUp === "NACHPRODUKTION" ||
      input.followUp === "EXPRESS_NACHPRODUKTION") &&
    input.costCents <= 0
  ) {
    problems.push("Nachproduktion ohne Kostenansatz.");
  }
  return problems;
}
