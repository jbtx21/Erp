// Vereinheitlichter Zahlungsabgleich (IA-Objekt-Merge, Kap. 9.4) — reine, IO-freie
// Domänenlogik für EIN gemeinsames Abgleich-Datenmodell hinter den früher drei Services
// (CAMT-Bankimport, Provider-Sync, manuelle Erfassung). Bestimmt den Abgleich-Status
// eines Zahlungseingangs (zugeordnet / teilzugeordnet / Klärung) und das OP-Aging.

/** Herkunft eines Zahlungseingangs (spiegelt das Prisma-Enum PaymentSource). */
export type PaymentSource = "CAMT" | "PROVIDER" | "MANUAL";

/** Abgleich-Status: voll zugeordnet, teilweise, oder offen (Klärungsliste). */
export type ReconcileStatus = "ZUGEORDNET" | "TEILZUGEORDNET" | "KLAERUNG";

/** OP-Aging-Klasse: noch nicht fällig oder Überfälligkeits-Band (Tage). */
export type AgingBucket = "NICHT_FAELLIG" | "FAELLIG_0_30" | "FAELLIG_31_60" | "FAELLIG_61_90" | "FAELLIG_90_PLUS";

/**
 * Abgleich-Status eines Zahlungseingangs aus Betrag vs. Summe der Allokationen.
 * Keine Allokation → Klärung; Summe < Betrag → teilweise (Rest in Klärung); sonst zugeordnet.
 */
export function reconcileStatus(amountCents: number, allocatedCents: number): ReconcileStatus {
  if (allocatedCents <= 0) return "KLAERUNG";
  if (allocatedCents < amountCents) return "TEILZUGEORDNET";
  return "ZUGEORDNET";
}

/** Überfälligkeitstage (>0 = überfällig); negativ/0 = noch nicht fällig. */
export function overdueDays(dueDate: Date, asOf: Date): number {
  const ms = asOf.getTime() - dueDate.getTime();
  return Math.floor(ms / 86_400_000);
}

/** Ordnet einen offenen Posten anhand der Fälligkeit einem Aging-Band zu. */
export function agingBucket(dueDate: Date, asOf: Date): AgingBucket {
  const d = overdueDays(dueDate, asOf);
  if (d <= 0) return "NICHT_FAELLIG";
  if (d <= 30) return "FAELLIG_0_30";
  if (d <= 60) return "FAELLIG_31_60";
  if (d <= 90) return "FAELLIG_61_90";
  return "FAELLIG_90_PLUS";
}

export const AGING_BUCKETS: readonly AgingBucket[] = [
  "NICHT_FAELLIG", "FAELLIG_0_30", "FAELLIG_31_60", "FAELLIG_61_90", "FAELLIG_90_PLUS",
];
