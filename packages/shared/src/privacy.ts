// DSGVO: Sperren/Anonymisieren statt Löschen (B12, Kap. 28). Personenbezogene
// Stammdaten werden überschrieben; Belege (Rechnungen etc.) bleiben als WORM
// unangetastet — Belegintegrität vor Datenminimierung nach Ablauf der Frist. Rein.

export const ANON_TEXT = "anonymisiert";

export interface ContactPII {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  /** Funktion/Rolle ist nicht personenbezogen → bleibt erhalten. */
  role?: string | null;
}

/** Überschreibt die personenbezogenen Felder eines Kontakts (Rolle bleibt). */
export function anonymizeContact(c: ContactPII): ContactPII {
  return {
    firstName: ANON_TEXT,
    lastName: ANON_TEXT,
    email: null,
    phone: null,
    role: c.role ?? null,
  };
}

export interface CompanyPII {
  name: string;
  /** Branche ist nicht personenbezogen → bleibt erhalten. */
  branche?: string | null;
}

/** Überschreibt den (ggf. personenbezogenen) Firmennamen (z. B. Einzelunternehmer). */
export function anonymizeCompany(c: CompanyPII): CompanyPII {
  return { name: ANON_TEXT, branche: c.branche ?? null };
}

/** Anonymisiert (PII überschrieben), wenn Vor- und Nachname auf ANON stehen. */
export function isContactAnonymized(c: ContactPII): boolean {
  return c.firstName === ANON_TEXT && c.lastName === ANON_TEXT;
}
