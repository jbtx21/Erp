// Reine RBAC-Regeln (Kap. 12). Policy: PRODUKTION darf ALLES LESEN, nur Preise/Margen/
// Beträge bleiben verborgen — durchgesetzt als serverseitige Feld-Redaktion vor der
// Auslieferung („Datenebene"). Kundenstammdaten/-vermerke sind für alle Rollen sichtbar.

import { redactForRole } from "./field-permissions.js";

export type Role = "ADMIN" | "BUERO" | "PRODUKTION" | "BUCHHALTUNG";

/** Preise/Margen/Beträge sichtbar? Für PRODUKTION nein. */
export function canViewFinancials(role: Role): boolean {
  return role !== "PRODUKTION";
}

/**
 * Kundenstammdaten/Kontaktdaten sichtbar? Für ALLE Rollen ja — PRODUKTION soll alles
 * lesen können, nur ohne Preise (Policy-Entscheidung). Bleibt als Prädikat erhalten,
 * falls künftig wieder feiner unterschieden werden soll.
 */
export function canViewCustomerData(_role: Role): boolean {
  return true;
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

/**
 * Redigiert die Preis-/Kundenfelder eines Auftrags-Eintrags für die Rolle. Dünner Wrapper
 * über das deklarative Feld-Register (redactForRole, Kap. 12) — identisches Verhalten wie
 * bisher: totalNetCents wird für PRODUKTION genullt, Kundenfelder bleiben (Policy). Alle
 * bestehenden Aufrufer (router.ts:329 Liste, rest-v1.ts Liste+Detail) bleiben unverändert.
 */
export function redactOrderForRole<T extends RedactableOrder>(item: T, role: Role): T {
  return redactForRole("order", item, role);
}
