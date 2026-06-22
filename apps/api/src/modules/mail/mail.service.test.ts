import { describe, expect, it } from "vitest";
import { LoggingMailSender, MailIntakeService, MailSendService } from "./mail.service.js";
import { InMemoryMailFetcher, InMemoryMailIntakeRepository } from "../../repositories/in-memory-mail.repository.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

const mail = (id: string, from: string, subject = "Anfrage") => ({ messageId: id, from, subject, body: "Bitte Angebot.", receivedAt: "2026-06-22T10:00:00Z" });

function setup(mails: ReturnType<typeof mail>[]) {
  const fetcher = new InMemoryMailFetcher(mails);
  const repo = new InMemoryMailIntakeRepository([{ companyId: "co-1", email: "einkauf@muster.de" }]);
  const numbering = new NumberingService(new InMemoryNumberingRepository());
  const audit = new MemAudit();
  return { svc: new MailIntakeService(fetcher, repo, numbering, audit), fetcher, repo };
}

describe("MailIntakeService (Maileingang → Anfrage)", () => {
  it("wandelt Mails in Anfragen, ordnet bekannte Absender zu", async () => {
    const { svc, repo, fetcher } = setup([mail("m-1", "neu@muster.de"), mail("m-2", "fremd@extern.com")]);
    const res = await svc.pollInbox();
    expect(res).toMatchObject({ created: 2, matched: 1, skipped: 0 });
    expect(repo.created.find((c) => c.externalRef === "m-1")?.companyId).toBe("co-1"); // Domain-Treffer
    expect(repo.created.find((c) => c.externalRef === "m-2")?.companyId).toBeNull();
    expect(fetcher.processed).toContain("m-1");
  });

  it("ist idempotent (zweiter Lauf legt nichts doppelt an)", async () => {
    const { svc } = setup([mail("m-1", "neu@muster.de")]);
    await svc.pollInbox();
    const second = await svc.pollInbox();
    expect(second.created).toBe(0);
  });
});

describe("MailSendService (SMTP-Port)", () => {
  it("delegiert an den Sender", async () => {
    const sender = new LoggingMailSender();
    await new MailSendService(sender).send({ to: "a@b.de", subject: "Hallo", body: "Test" });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe("a@b.de");
  });
});
