// Multi-Mailkonten — In-Memory, mit Test-Schlüssel für die Passwort-Verschlüsselung.

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryMailAccountRepository } from "../../repositories/in-memory-mail-account.repository.js";
import { MailAccountError, MailAccountService } from "./mail-account.service.js";

function setup(withKey = true) {
  const repo = new InMemoryMailAccountRepository();
  return { repo, service: new MailAccountService(repo, withKey ? randomBytes(32) : null) };
}

describe("MailAccountService (Multi-Mailkonten)", () => {
  it("legt ein Konto an, IONOS-Defaults greifen, Passwort wird nie ausgeliefert", async () => {
    const { repo, service } = setup();
    const acc = await service.create({ name: "Vertrieb", emailAddress: "Vertrieb@TEXMA-GmbH.de", password: "geheim" });
    expect(acc).toMatchObject({ emailAddress: "vertrieb@texma-gmbh.de", smtpHost: "smtp.ionos.de", smtpPort: 587, imapHost: "imap.ionos.de", hasPassword: true });
    expect(acc as unknown as Record<string, unknown>).not.toHaveProperty("passwordEnc");
    // Passwort liegt verschlüsselt vor (kein Klartext).
    const stored = await repo.get(acc.id);
    expect(stored?.passwordEnc).toBeTruthy();
    expect(stored?.passwordEnc).not.toContain("geheim");
  });

  it("setzt Standard-Ein-/Ausgang exklusiv", async () => {
    const { service } = setup();
    const a = await service.create({ name: "A", emailAddress: "a@texma-gmbh.de", password: "x", defaultOutgoing: true });
    const b = await service.create({ name: "B", emailAddress: "b@texma-gmbh.de", password: "y" });
    await service.setDefault(b.id, "outgoing");
    const list = await service.list();
    expect(list.find((x) => x.id === a.id)?.defaultOutgoing).toBe(false);
    expect(list.find((x) => x.id === b.id)?.defaultOutgoing).toBe(true);
  });

  it("liefert die SMTP-Config des Standard-Ausgangskontos (entschlüsselt)", async () => {
    const { service } = setup();
    const a = await service.create({ name: "A", emailAddress: "a@texma-gmbh.de", password: "pw123", smtpPort: 465, defaultOutgoing: true });
    const cfg = await service.defaultOutgoingConfig();
    expect(cfg).toMatchObject({ host: "smtp.ionos.de", port: 465, secure: true, user: "a@texma-gmbh.de", pass: "pw123", from: "a@texma-gmbh.de" });
    // Deaktiviert → keine Config (Fallback greift).
    await service.update(a.id, { name: "A", emailAddress: "a@texma-gmbh.de", disabled: true });
    expect(await service.defaultOutgoingConfig()).toBeNull();
  });

  it("verweigert Passwortspeicherung ohne Schlüssel", async () => {
    const { service } = setup(false);
    await expect(service.create({ name: "A", emailAddress: "a@texma-gmbh.de", password: "x" })).rejects.toBeInstanceOf(MailAccountError);
  });

  it("verlangt Name und E-Mail", async () => {
    const { service } = setup();
    await expect(service.create({ name: " ", emailAddress: "a@texma-gmbh.de" })).rejects.toBeInstanceOf(MailAccountError);
    await expect(service.create({ name: "A", emailAddress: "" })).rejects.toBeInstanceOf(MailAccountError);
  });
});
