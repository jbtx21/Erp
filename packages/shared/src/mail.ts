// Maileingang → Anfrage (rein, IO-frei): Abgleich der Absenderadresse mit den
// Kundenstammdaten (Kontakt-E-Mails) und Abbildung einer eingehenden Mail auf eine
// Anfrage. IMAP/SMTP-Transport liegt außerhalb (Worker-Adapter).

export interface IncomingMail {
  /** Eindeutige Message-ID (Idempotenz). */
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface CompanyEmailRef {
  companyId: string;
  email: string;
}

/** Kleinschreibung + Trimmen; extrahiert die Adresse aus „Name <a@b.de>". */
export function normalizeEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  const addr = (m ? m[1] : raw) ?? "";
  return addr.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = normalizeEmail(email).lastIndexOf("@");
  return at >= 0 ? normalizeEmail(email).slice(at + 1) : "";
}

/**
 * Ordnet eine Absenderadresse einer Firma zu: zuerst exakte Kontakt-E-Mail, sonst
 * Domain-Treffer (gleiche Domain wie ein hinterlegter Kontakt). null = keine Zuordnung
 * (kein Phantom-Kunde — der Innendienst ordnet manuell zu).
 */
export function matchCompanyByEmail(from: string, refs: ReadonlyArray<CompanyEmailRef>): string | null {
  const addr = normalizeEmail(from);
  if (!addr) return null;
  const exact = refs.find((r) => normalizeEmail(r.email) === addr);
  if (exact) return exact.companyId;
  const domain = emailDomain(addr);
  if (!domain) return null;
  const byDomain = refs.find((r) => emailDomain(r.email) === domain);
  return byDomain ? byDomain.companyId : null;
}

export interface InquiryDraft {
  text: string;
  quelle: "EMAIL";
  companyId: string | null;
  kontaktName: string | null;
  externalRef: string;
}

/** Bildet eine eingehende Mail auf einen Anfrage-Entwurf ab. */
export function mailToInquiry(mail: IncomingMail, companyId: string | null): InquiryDraft {
  const betreff = mail.subject.trim() || "(ohne Betreff)";
  return {
    text: `Betreff: ${betreff}\nVon: ${mail.from}\n\n${mail.body.trim()}`,
    quelle: "EMAIL",
    companyId,
    kontaktName: normalizeEmail(mail.from) || null,
    externalRef: mail.messageId,
  };
}
