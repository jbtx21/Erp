import { describe, expect, it } from "vitest";
import { MessageError, MessageService } from "./messages.service.js";
import { InMemoryMessageRepository } from "../../repositories/in-memory-messages.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
const svc = () => new MessageService(new InMemoryMessageRepository(), new MemAudit());

describe("MessageService (Mitarbeiter-Nachrichtenportal)", () => {
  it("sendet eine Nachricht; sie erscheint im Posteingang des Empfängers + Postausgang des Senders", async () => {
    const s = svc();
    await s.send("anna@texma.de", "Bert@texma.de", "Produktion", "Bitte vorziehen.");
    const inbox = await s.inbox("bert@texma.de");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.subject).toBe("Produktion");
    expect(await s.sent("anna@texma.de")).toHaveLength(1);
    expect(await s.unreadCount("bert@texma.de")).toBe(1);
  });

  it("markiert als gelesen (nur durch den Empfänger)", async () => {
    const s = svc();
    const { id } = await s.send("anna@texma.de", "bert@texma.de", "X", "Y");
    await expect(s.markRead(id, "anna@texma.de")).rejects.toBeInstanceOf(MessageError);
    await s.markRead(id, "bert@texma.de");
    expect(await s.unreadCount("bert@texma.de")).toBe(0);
  });

  it("validiert Empfänger/Betreff und verbietet Nachricht an sich selbst", async () => {
    const s = svc();
    await expect(s.send("a@b.de", "", "X", "Y")).rejects.toBeInstanceOf(MessageError);
    await expect(s.send("a@b.de", "c@d.de", "", "Y")).rejects.toBeInstanceOf(MessageError);
    await expect(s.send("a@b.de", "A@B.de", "X", "Y")).rejects.toBeInstanceOf(MessageError);
  });
});
