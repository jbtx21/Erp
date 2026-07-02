// Deklaratives Feld-Berechtigungs-Register (Kap. 12). Verallgemeinert die frühere Ad-hoc-
// Redaktion (redactOrderForRole) zum ERPNext-„Permission-Level"-Muster (Deep-Research F3),
// aber capability-basiert für TEXMAs vier Rollen. Feldrechte werden serverseitig im
// Auslieferungs-/Query-Pfad durchgesetzt (Liste UND Detail), nie nur im UI — die
// Enforcement-Lücke aus F3 (frappe #16388: Permlevel-Read in Listen-Queries) wird so
// bewusst vermieden.

import { canViewCustomerData, canViewFinancials, redactFields, type Role } from "./rbac.js";

/** Fähigkeit, die das Lesen eines Feldes voraussetzt (erweiterbar). */
export type FieldCapability = "financial" | "customerData";

/** Belegtypen mit deklarativer Feld-Redaktion (weitere später). */
export type EntityType = "order" | "quote" | "invoice";

/**
 * Register: Belegtyp → Feldname → benötigte Capability. Nur Felder, die real im jeweiligen
 * Listen-/Detail-DTO existieren. Fehlt ein Feld im konkreten Item, wird es übersprungen.
 * Das ist das deklarative Gegenstück zu ERPNexts „Permission Levels" (Feld→Level→Rolle).
 */
export const FIELD_POLICY: Record<EntityType, Record<string, FieldCapability>> = {
  // Auftrags-Listeneintrag — entspricht 1:1 der bisherigen redactOrderForRole-Logik.
  order: {
    totalNetCents: "financial",
    employeeNote: "customerData",
    companyName: "customerData",
  },
  // Angebots-Listeneintrag (QuoteRow): Betrags- und Margenfelder.
  quote: {
    totalNetCents: "financial",
    totalTaxCents: "financial",
    totalGrossCents: "financial",
    totalDbCents: "financial", // Summe Deckungsbeitrag (Marge)
    companyName: "customerData",
  },
  // Rechnungs-Listeneintrag: Betragsfelder.
  invoice: {
    netCents: "financial",
    taxCents: "financial",
    grossCents: "financial",
    openCents: "financial", // offener Posten
  },
};

/**
 * Capabilities einer Rolle — datengetrieben aus den öffentlichen Sicht-Prädikaten
 * (canViewFinancials/canViewCustomerData). PRODUKTION erhält kein "financial".
 */
export function roleCapabilities(role: Role): Set<FieldCapability> {
  const caps = new Set<FieldCapability>();
  if (canViewFinancials(role)) caps.add("financial");
  if (canViewCustomerData(role)) caps.add("customerData");
  return caps;
}

/**
 * Generische Feld-Redaktion: nullt (immutable-Kopie via redactFields) alle Felder des
 * Belegtyps, deren Capability die Rolle NICHT hat — sofern das Feld im Item vorhanden ist.
 */
export function redactForRole<T extends object>(entity: EntityType, item: T, role: Role): T {
  const policy = FIELD_POLICY[entity];
  const caps = roleCapabilities(role);
  const fields: (keyof T)[] = [];
  for (const [field, cap] of Object.entries(policy)) {
    if (!caps.has(cap) && field in item) fields.push(field as keyof T);
  }
  return fields.length ? redactFields(item, fields) : item;
}
