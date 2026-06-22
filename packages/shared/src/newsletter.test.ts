import { describe, expect, it } from "vitest";
import { buildAudience, type NewsletterContact } from "./newsletter.js";

const c = (over: Partial<NewsletterContact>): NewsletterContact => ({
  email: "a@b.de", firstName: "Max", lastName: "Muster", newsletterOptIn: true, gesperrt: false, anonymisiert: false, ...over,
});

describe("buildAudience (DSGVO-konforme Empfängerliste)", () => {
  it("nimmt nur Opt-in mit gültiger E-Mail, ohne Sperre/Anonymisierung", () => {
    const list = buildAudience([
      c({ email: "ok@x.de" }),
      c({ email: "nooptin@x.de", newsletterOptIn: false }),
      c({ email: "gesperrt@x.de", gesperrt: true }),
      c({ email: "anon@x.de", anonymisiert: true }),
      c({ email: null }),
      c({ email: "ungueltig" }),
    ]);
    expect(list.map((r) => r.email)).toEqual(["ok@x.de"]);
  });

  it("dedupliziert über die normalisierte Adresse", () => {
    const list = buildAudience([c({ email: "Max@X.de" }), c({ email: "max@x.de" })]);
    expect(list).toHaveLength(1);
    expect(list[0]?.email).toBe("max@x.de");
  });

  it("setzt den Anzeigenamen", () => {
    expect(buildAudience([c({ firstName: "Anna", lastName: "Klein" })])[0]?.name).toBe("Anna Klein");
  });
});
