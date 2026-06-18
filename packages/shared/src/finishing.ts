// Sollzeiten je Veredelungsart — Kap. 5.2/33. Klärung K-09.
// Grobe Startwerte (im Produktions-Workshop zu verfeinern). Liefert die Plan-
// Lohnminuten als Basis für Nachkalkulation (postcalc.ts / T-10) und Ampel.

export type FinishingKind =
  | "TRANSFER"
  | "SIEBDRUCK_EINRICHTUNG"
  | "SIEBDRUCK_DRUCK"
  | "STICK";

/** Bezugseinheit der Sollzeit. */
export type FinishingBasis = "STUECK" | "EINRICHTUNG" | "PRO_1000_STICHE";

export interface FinishingTargetTime {
  kind: FinishingKind;
  targetMinutes: number;
  basis: FinishingBasis;
}

/**
 * Grobe Start-Sollzeiten (K-09) — bewusst konservativ, vor Go-Live im Workshop
 * zu bestätigen. Im Betrieb über die DB (`FinishingTargetTime`) überschreibbar.
 */
export const DEFAULT_FINISHING_TARGET_TIMES: Record<
  FinishingKind,
  FinishingTargetTime
> = {
  TRANSFER: { kind: "TRANSFER", targetMinutes: 1.5, basis: "STUECK" },
  SIEBDRUCK_EINRICHTUNG: {
    kind: "SIEBDRUCK_EINRICHTUNG",
    targetMinutes: 20,
    basis: "EINRICHTUNG",
  },
  SIEBDRUCK_DRUCK: { kind: "SIEBDRUCK_DRUCK", targetMinutes: 0.3, basis: "STUECK" },
  STICK: { kind: "STICK", targetMinutes: 8, basis: "PRO_1000_STICHE" },
};

export interface FinishingWorkInput {
  kind: FinishingKind;
  /** Stückzahl (für STUECK), Anzahl Einrichtungen, oder Stichzahl (für STICK). */
  qty: number;
  stitchCount?: number;
}

/**
 * Plan-Sollminuten für einen Veredelungsschritt anhand der Bezugseinheit.
 * STICK rechnet über die Stichzahl (qty wird dann als Stückzahl × Stiche gedeutet,
 * daher stitchCount explizit übergeben).
 */
export function plannedMinutes(
  input: FinishingWorkInput,
  table: Record<FinishingKind, FinishingTargetTime> = DEFAULT_FINISHING_TARGET_TIMES
): number {
  const t = table[input.kind];
  switch (t.basis) {
    case "STUECK":
      return t.targetMinutes * input.qty;
    case "EINRICHTUNG":
      return t.targetMinutes * input.qty;
    case "PRO_1000_STICHE": {
      const stitches = input.stitchCount ?? 0;
      return (t.targetMinutes * stitches) / 1000;
    }
  }
}
