import { describe, expect, it } from "vitest";
import { NewsletterError, NewsletterService, StubNewsletterProvider } from "./newsletter.service.js";
import { InMemoryNewsletterRepository } from "../../repositories/in-memory-newsletter.repository.js";
import type { NewsletterContact } from "@texma/shared";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

const contact = (over: Partial<NewsletterContact>): NewsletterContact => ({
  email: "a@b.de", firstName: "Max", lastName: "Muster", newsletterOptIn: true, gesperrt: false, anonymisiert: false, ...over,
});

function setup(contacts: NewsletterContact[]) {
  const repo = new InMemoryNewsletterRepository(contacts);
  const provider = new StubNewsletterProvider();
  const svc = new NewsletterService(repo, provider, new MemAudit());
  return { svc, repo, provider };
}

describe("NewsletterService (Brevo-Anbindung)", () => {
  it("zeigt die Opt-in-Empfängerzahl", async () => {
    const { svc } = setup([contact({ email: "a@x.de" }), contact({ email: "b@x.de", newsletterOptIn: false })]);
    expect(await svc.audienceSize()).toBe(1);
  });

  it("legt eine Kampagne an und versendet an die Empfänger (Stub)", async () => {
    const { svc, provider } = setup([contact({ email: "a@x.de" }), contact({ email: "c@x.de" })]);
    const { id } = await svc.createCampaign("Sommeraktion", "Hallo!");
    const res = await svc.send(id);
    expect(res.recipientCount).toBe(2);
    expect(provider.sent[0]).toMatchObject({ subject: "Sommeraktion", count: 2 });
  });

  it("verbietet Doppelversand und leere Empfänger", async () => {
    const { svc } = setup([contact({ email: "a@x.de" })]);
    const { id } = await svc.createCampaign("X", "Y");
    await svc.send(id);
    await expect(svc.send(id)).rejects.toBeInstanceOf(NewsletterError);

    const { svc: svc2 } = setup([contact({ newsletterOptIn: false })]);
    const c2 = await svc2.createCampaign("X", "Y");
    await expect(svc2.send(c2.id)).rejects.toBeInstanceOf(NewsletterError);
  });

  it("verlangt Betreff und Inhalt", async () => {
    const { svc } = setup([]);
    await expect(svc.createCampaign("", "x")).rejects.toBeInstanceOf(NewsletterError);
    await expect(svc.createCampaign("x", "")).rejects.toBeInstanceOf(NewsletterError);
  });
});
