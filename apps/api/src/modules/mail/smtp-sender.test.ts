import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import { smtpConfigFromEnv, SmtpError, SmtpMailSender } from "./smtp-sender.js";

// Fake-SMTP-Socket: gibt das Begrüßungs-220 aus und beantwortet jedes Kommando mit
// der nächsten skript-Antwort. Schneidet die gesendeten Kommandos mit.
class FakeSocket extends EventEmitter {
  written: string[] = [];
  private responses: string[];
  constructor(responses: string[]) {
    super();
    this.responses = [...responses];
  }
  setEncoding(): void { /* no-op */ }
  override on(event: string, listener: (...a: unknown[]) => void): this {
    super.on(event, listener);
    if (event === "data") setImmediate(() => this.emit("data", "220 smtp.ionos.de ESMTP\r\n"));
    return this;
  }
  write(data: string): boolean {
    this.written.push(data);
    const resp = this.responses.shift();
    if (resp !== undefined) setImmediate(() => this.emit("data", resp));
    return true;
  }
  end(): void { /* no-op */ }
}

const OK_SCRIPT = [
  "250-smtp.ionos.de\r\n250 AUTH LOGIN\r\n", // EHLO
  "334 VXNlcm5hbWU6\r\n",                     // AUTH LOGIN
  "334 UGFzc3dvcmQ6\r\n",                     // user
  "235 2.7.0 OK\r\n",                          // pass
  "250 OK\r\n",                                // MAIL FROM
  "250 OK\r\n",                                // RCPT TO
  "354 End data\r\n",                          // DATA
  "250 2.0.0 queued\r\n",                      // message + .
  "221 Bye\r\n",                               // QUIT
];

const cfg = { host: "smtp.ionos.de", port: 465, secure: true, user: "info@texma.de", pass: "geheim", from: "info@texma.de" };

describe("SmtpMailSender (IONOS, ohne Fremdbibliothek)", () => {
  it("führt den SMTP-Dialog korrekt: EHLO/AUTH LOGIN/MAIL/RCPT/DATA/QUIT", async () => {
    const sock = new FakeSocket(OK_SCRIPT);
    await new SmtpMailSender(cfg, async () => sock as unknown as Duplex).send({ to: "kunde@example.de", subject: "Auftragsbestaetigung 123", body: "Hallo!" });
    const sent = sock.written.join("");
    expect(sent).toContain("EHLO smtp.ionos.de");
    expect(sent).toContain("AUTH LOGIN");
    expect(sent).toContain(Buffer.from("info@texma.de").toString("base64")); // user b64
    expect(sent).toContain(Buffer.from("geheim").toString("base64"));        // pass b64
    expect(sent).toContain("MAIL FROM:<info@texma.de>");
    expect(sent).toContain("RCPT TO:<kunde@example.de>");
    expect(sent).toContain("Subject: Auftragsbestaetigung 123");
    expect(sent).toContain("Hallo!");
    expect(sent).toContain("QUIT");
  });

  it("kodiert Nicht-ASCII-Betreff RFC-2047 (Umlaute)", async () => {
    const sock = new FakeSocket(OK_SCRIPT);
    await new SmtpMailSender(cfg, async () => sock as unknown as Duplex).send({ to: "k@x.de", subject: "Auftragsbestätigung", body: "b" });
    expect(sock.written.join("")).toContain("=?UTF-8?B?");
  });

  it("baut eine multipart/mixed-Nachricht mit PDF-Anhang", async () => {
    const sock = new FakeSocket(OK_SCRIPT);
    const pdfB64 = Buffer.from("%PDF-1.7 dummy").toString("base64");
    await new SmtpMailSender(cfg, async () => sock as unknown as Duplex).send({
      to: "kunde@example.de", subject: "Angebot", body: "Anbei das Angebot.",
      attachments: [{ filename: "Angebot-AN-1.pdf", contentBase64: pdfB64, contentType: "application/pdf" }],
    });
    const sent = sock.written.join("");
    expect(sent).toContain("Content-Type: multipart/mixed; boundary=");
    expect(sent).toContain('Content-Disposition: attachment; filename="Angebot-AN-1.pdf"');
    expect(sent).toContain("Content-Transfer-Encoding: base64");
    expect(sent).toContain(pdfB64);
  });

  it("wirft bei unerwartetem Statuscode (z. B. Auth-Fehler)", async () => {
    const bad = [...OK_SCRIPT];
    bad[3] = "535 5.7.8 Authentication failed\r\n"; // pass → Fehler
    const sock = new FakeSocket(bad);
    await expect(new SmtpMailSender(cfg, async () => sock as unknown as Duplex).send({ to: "x@y.de", subject: "s", body: "b" }))
      .rejects.toBeInstanceOf(SmtpError);
  });
});

describe("smtpConfigFromEnv (IONOS-Defaults)", () => {
  it("liefert null ohne Zugangsdaten", () => {
    expect(smtpConfigFromEnv({})).toBeNull();
  });
  it("nutzt IONOS-Host als Default und leitet secure aus dem Port ab", () => {
    const c = smtpConfigFromEnv({ SMTP_USER: "a@b.de", SMTP_PASS: "p", SMTP_PORT: "465" });
    expect(c).toMatchObject({ host: "smtp.ionos.de", port: 465, secure: true, from: "a@b.de" });
    const c587 = smtpConfigFromEnv({ SMTP_USER: "a@b.de", SMTP_PASS: "p" });
    expect(c587).toMatchObject({ port: 587, secure: false });
  });
});
