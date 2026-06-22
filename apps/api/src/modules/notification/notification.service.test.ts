// Benachrichtigungen + E-Mail-Vorlagen (G-5). In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import {
  EmailTemplateError,
  EmailTemplateService,
  NotificationService,
} from "./notification.service.js";
import {
  InMemoryEmailTemplateRepository,
  InMemoryNotificationRepository,
} from "../../repositories/in-memory-notification.repository.js";

describe("NotificationService (G-5)", () => {
  it("benachrichtigt je Empfänger, zählt Ungelesene und markiert gelesen", async () => {
    const svc = new NotificationService(new InMemoryNotificationRepository());
    const a = await svc.notify("a@texma.de", "Auftrag versendet", "WC-1", "orders");
    await svc.notify("a@texma.de", "Zweite", null, null);
    await svc.notify("b@texma.de", "Fremd", null, null);
    expect(await svc.unreadCount("a@texma.de")).toBe(2);
    expect(await svc.listFor("b@texma.de")).toHaveLength(1); // Empfänger getrennt
    await svc.markRead(a.id);
    expect(await svc.unreadCount("a@texma.de")).toBe(1);
    await svc.markAllRead("a@texma.de");
    expect(await svc.unreadCount("a@texma.de")).toBe(0);
  });
});

describe("EmailTemplateService (G-5)", () => {
  it("legt eine Vorlage an und rendert Betreff/Text mit Variablen", async () => {
    const svc = new EmailTemplateService(new InMemoryEmailTemplateRepository());
    await svc.upsert("auftrag.versendet", "Ihr Auftrag {{nr}}", "Hallo {{name}}, {{nr}} ist unterwegs.");
    const r = await svc.render("auftrag.versendet", { nr: "WC-1", name: "Max" });
    expect(r.subject).toBe("Ihr Auftrag WC-1");
    expect(r.body).toBe("Hallo Max, WC-1 ist unterwegs.");
  });

  it("wirft bei fehlender Vorlage und bei leeren Pflichtfeldern", async () => {
    const svc = new EmailTemplateService(new InMemoryEmailTemplateRepository());
    await expect(svc.render("fehlt", {})).rejects.toBeInstanceOf(EmailTemplateError);
    await expect(svc.upsert("k", "", "x")).rejects.toBeInstanceOf(EmailTemplateError);
  });
});
