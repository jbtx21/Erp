import { describe, expect, it } from "vitest";
import { matchCompanyByEmail, mailToInquiry, normalizeEmail, type IncomingMail } from "./mail.js";

const refs = [
  { companyId: "co-1", email: "einkauf@muster.de" },
  { companyId: "co-2", email: "info@gross.ag" },
];

describe("E-Mail-Abgleich mit Kundenstammdaten", () => {
  it("extrahiert die Adresse aus 'Name <a@b>' und normalisiert", () => {
    expect(normalizeEmail("Max Muster <Max@Muster.DE>")).toBe("max@muster.de");
  });
  it("trifft exakt über die Kontakt-E-Mail", () => {
    expect(matchCompanyByEmail("einkauf@muster.de", refs)).toBe("co-1");
  });
  it("trifft per Domain, wenn keine exakte Adresse passt", () => {
    expect(matchCompanyByEmail("neuer.kollege@muster.de", refs)).toBe("co-1");
  });
  it("liefert null bei unbekannter Domain (kein Phantom-Kunde)", () => {
    expect(matchCompanyByEmail("fremder@unbekannt.com", refs)).toBeNull();
  });
});

describe("Mail → Anfrage", () => {
  const mail: IncomingMail = { messageId: "m-1", from: "Max <max@muster.de>", subject: "Angebot 200 Polos", body: "Bitte um Angebot.", receivedAt: "2026-06-22T10:00:00Z" };
  it("bildet Betreff/Absender/Text ab und setzt EMAIL + externalRef", () => {
    const d = mailToInquiry(mail, "co-1");
    expect(d.quelle).toBe("EMAIL");
    expect(d.companyId).toBe("co-1");
    expect(d.externalRef).toBe("m-1");
    expect(d.text).toContain("200 Polos");
    expect(d.text).toContain("max@muster.de");
  });
  it("erlaubt nicht zugeordnete Mails (companyId null)", () => {
    expect(mailToInquiry(mail, null).companyId).toBeNull();
  });
});
