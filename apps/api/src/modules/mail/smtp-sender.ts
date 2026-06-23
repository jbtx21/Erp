// Echter SMTP-Versand ohne Fremdbibliothek — minimaler SMTP-Client über node:tls/net.
// Unterstützt implizites TLS (Port 465) und STARTTLS (Port 587, IONOS-Standard) mit
// AUTH LOGIN. Verbindung injizierbar → testbar gegen einen Fake-Socket ohne Netzwerk.
//
// IONOS-Standard: smtp.ionos.de, Port 587 (STARTTLS) bzw. 465 (SSL/TLS),
// Benutzername = volle E-Mail-Adresse.

import net from "node:net";
import tls from "node:tls";
import type { Duplex } from "node:stream";
import type { MailSender, OutgoingMail } from "./mail.service.js";

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = implizites TLS (465); false = Klartext-Start + STARTTLS (587). */
  secure: boolean;
  user: string;
  pass: string;
  /** Absenderadresse (Envelope + From-Header). */
  from: string;
}

/** Liest die SMTP-Konfiguration aus der Umgebung (IONOS als Default-Host). */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!user || !pass) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  return {
    host: env.SMTP_HOST ?? "smtp.ionos.de",
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    user,
    pass,
    from: env.SMTP_FROM ?? user,
  };
}

/** Stellt die (ggf. TLS-)Verbindung her. Injizierbar für Tests. */
export type SmtpConnector = (cfg: SmtpConfig) => Promise<Duplex>;

const realConnector: SmtpConnector = (cfg) =>
  new Promise((resolve, reject) => {
    const sock = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, () => resolve(sock))
      : net.connect({ host: cfg.host, port: cfg.port }, () => resolve(sock));
    sock.once("error", reject);
  });

const CRLF = "\r\n";

export class SmtpError extends Error {}

export class SmtpMailSender implements MailSender {
  constructor(
    private readonly cfg: SmtpConfig,
    private readonly connect: SmtpConnector = realConnector
  ) {}

  async send(mail: OutgoingMail): Promise<void> {
    const sock = await this.connect(this.cfg);
    const io = new SmtpDialog(sock);
    try {
      await io.expect(220);
      await io.cmd(`EHLO ${this.cfg.host}`, 250);
      if (!this.cfg.secure) {
        // STARTTLS-Upgrade (Port 587)
        await io.cmd("STARTTLS", 220);
        const secured = await upgradeTls(sock, this.cfg.host);
        io.attach(secured);
        await io.cmd(`EHLO ${this.cfg.host}`, 250);
      }
      await io.cmd("AUTH LOGIN", 334);
      await io.cmd(b64(this.cfg.user), 334);
      await io.cmd(b64(this.cfg.pass), 235);
      await io.cmd(`MAIL FROM:<${this.cfg.from}>`, 250);
      await io.cmd(`RCPT TO:<${mail.to}>`, 250);
      await io.cmd("DATA", 354);
      await io.cmd(buildMessage(this.cfg.from, mail) + CRLF + ".", 250);
      await io.cmd("QUIT", 221).catch(() => undefined);
    } finally {
      sock.end();
    }
  }
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function buildMessage(from: string, mail: OutgoingMail): string {
  // Punkt-Stuffing: Zeilen, die mit "." beginnen, verdoppeln (RFC 5321).
  const body = mail.body.replace(/\r?\n/g, CRLF).replace(/^\./gm, "..");
  const atts = mail.attachments ?? [];

  if (atts.length === 0) {
    const headers = [
      `From: ${from}`,
      `To: ${mail.to}`,
      `Subject: ${encodeHeader(mail.subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
    ];
    return headers.join(CRLF) + CRLF + CRLF + body;
  }

  // Mehrteilige Nachricht (Text + Anhänge) als multipart/mixed.
  const boundary = `texma_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join(CRLF);
  const attParts = atts.map((a) => [
    `--${boundary}`,
    `Content-Type: ${a.contentType ?? "application/octet-stream"}; name="${a.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${a.filename}"`,
    "",
    wrapBase64(a.contentBase64),
  ].join(CRLF));
  return headers.join(CRLF) + CRLF + CRLF + [textPart, ...attParts, `--${boundary}--`].join(CRLF);
}

/** Base64 auf 76-Zeichen-Zeilen umbrechen (RFC 2045). */
function wrapBase64(b64s: string): string {
  return (b64s.match(/.{1,76}/g) ?? [b64s]).join(CRLF);
}

/** Nicht-ASCII-Betreff RFC-2047 (UTF-8, Base64) kodieren. */
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function upgradeTls(sock: Duplex, host: string): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({ socket: sock as net.Socket, servername: host }, () => resolve(secured));
    secured.once("error", reject);
  });
}

/** Liest SMTP-Antworten (mehrzeilig) und sendet Kommandos. */
class SmtpDialog {
  private buffer = "";
  private waiters: Array<{ resolve: (line: string) => void; reject: (e: Error) => void }> = [];
  constructor(private sock: Duplex) { this.attach(sock); }

  attach(sock: Duplex): void {
    this.sock = sock;
    sock.setEncoding?.("utf8");
    sock.on("data", (chunk: string) => this.onData(chunk));
    sock.on("error", (e: Error) => { const w = this.waiters.shift(); w?.reject(e); });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    // Eine vollständige Antwort endet mit "NNN <text>" (Leerzeichen nach Code).
    let idx;
    while ((idx = this.indexOfComplete()) >= 0) {
      const resp = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx);
      const w = this.waiters.shift();
      w?.resolve(resp);
    }
  }

  private indexOfComplete(): number {
    const lines = this.buffer.split(CRLF);
    let consumed = 0;
    for (const line of lines) {
      consumed += line.length + CRLF.length;
      if (/^\d{3} /.test(line)) return consumed;
    }
    return -1;
  }

  expect(code: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiters.push({
        resolve: (line) => {
          const got = Number(line.slice(0, 3));
          got === code ? resolve(line) : reject(new SmtpError(`SMTP ${got} (erwartet ${code}): ${line.trim()}`));
        },
        reject,
      });
    });
  }

  cmd(command: string, code: number): Promise<string> {
    const p = this.expect(code);
    this.sock.write(command + CRLF);
    return p;
  }
}
