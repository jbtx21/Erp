// Newsletter (Brevo-Anbindung): reine Empfängerlisten-Bildung aus den Kontakten.
// DSGVO (Kap. 28): nur Kontakte mit gültiger E-Mail, Opt-in und ohne Sperre/
// Anonymisierung; doppelte Adressen werden zusammengeführt. IO-frei.

export interface NewsletterContact {
  email: string | null;
  firstName: string;
  lastName: string;
  newsletterOptIn: boolean;
  gesperrt: boolean;
  anonymisiert: boolean;
}

export interface NewsletterRecipient {
  email: string;
  name: string;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Baut die Empfängerliste: nur Opt-in, gültige E-Mail, nicht gesperrt/anonymisiert;
 * dedupliziert über die (normalisierte) Adresse. Reihenfolge stabil (erstes Vorkommen).
 */
export function buildAudience(contacts: ReadonlyArray<NewsletterContact>): NewsletterRecipient[] {
  const seen = new Set<string>();
  const out: NewsletterRecipient[] = [];
  for (const c of contacts) {
    if (!c.newsletterOptIn || c.gesperrt || c.anonymisiert) continue;
    if (!c.email || !c.email.includes("@")) continue;
    const key = normalize(c.email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email: key, name: `${c.firstName} ${c.lastName}`.trim() });
  }
  return out;
}
