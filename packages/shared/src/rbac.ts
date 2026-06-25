// Reine RBAC-Regeln (Kap. 12). Rolle PRODUKTION darf KEINE Preise/Kundendaten sehen
// — durchgesetzt als serverseitige Feld-Redaktion vor der Auslieferung („Datenebene").

export type Role = "ADMIN" | "BUERO" | "PRODUKTION" | "BUCHHALTUNG";

/** Preise/Margen/Beträge sichtbar? Für PRODUKTION nein. */
export function canViewFinancials(role: Role): boolean {
  return role !== "PRODUKTION";
}

/** Kundenstammdaten/Kontaktdaten sichtbar? Für PRODUKTION nein. */
export function canViewCustomerData(role: Role): boolean {
  return role !== "PRODUKTION";
}

/** Setzt die genannten Felder auf null (immutable-Kopie). */
export function redactFields<T extends object, K extends keyof T>(
  obj: T,
  fields: readonly K[]
): T {
  const copy = { ...obj };
  for (const f of fields) {
    copy[f] = null as T[K];
  }
  return copy;
}

/** Auftrags-Listeneintrag (Felder, die je nach Rolle redigiert werden). */
export interface RedactableOrder {
  totalNetCents: number | null;
  employeeNote: string | null;
  companyName?: string | null;
}

/** Redigiert Preis-/Kundenfelder eines Auftrags-Eintrags für die Rolle. */
export function redactOrderForRole<T extends RedactableOrder>(item: T, role: Role): T {
  const fields: (keyof RedactableOrder)[] = [];
  if (!canViewFinancials(role)) fields.push("totalNetCents");
  if (!canViewCustomerData(role)) { fields.push("employeeNote"); if ("companyName" in item) fields.push("companyName"); }
  return fields.length ? redactFields(item, fields as (keyof T)[]) : item;
}
