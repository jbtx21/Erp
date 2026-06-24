// Multi-Mailkonten (IONOS-Postfächer): mehrere Konten verwalten, je eines als Standard
// für ein-/ausgehend. Passwörter werden AES-256-GCM-verschlüsselt gespeichert (nie im
// Klartext nach außen) — die Liste liefert nur ein hasPassword-Flag. Der ausgehende
// Standard liefert eine SMTP-Konfiguration für den Versand (mit ENV-Fallback im Server).

import { decryptSecret, encryptSecret } from "@texma/shared";
import type { SmtpConfig } from "./smtp-sender.js";

export interface MailAccountInput {
  name: string;
  emailAddress: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  username?: string | null;
  /** Klartext-Passwort (wird verschlüsselt abgelegt); undefined = unverändert lassen. */
  password?: string | null;
  enableIncoming?: boolean;
  enableOutgoing?: boolean;
  defaultIncoming?: boolean;
  defaultOutgoing?: boolean;
  disabled?: boolean;
}

/** Konto-Sicht ohne Geheimnis (Passwort nur als hasPassword-Flag). */
export interface MailAccountView {
  id: string;
  name: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string | null;
  hasPassword: boolean;
  enableIncoming: boolean;
  enableOutgoing: boolean;
  defaultIncoming: boolean;
  defaultOutgoing: boolean;
  disabled: boolean;
}

/** Persistierter Datensatz inkl. verschlüsseltem Passwort (nur intern). */
export interface MailAccountRecord extends Omit<MailAccountView, "hasPassword"> {
  passwordEnc: string | null;
}

export interface MailAccountRepository {
  list(): Promise<MailAccountRecord[]>;
  get(id: string): Promise<MailAccountRecord | null>;
  create(data: Omit<MailAccountRecord, "id">): Promise<MailAccountRecord>;
  update(id: string, data: Partial<Omit<MailAccountRecord, "id">>): Promise<MailAccountRecord>;
  remove(id: string): Promise<void>;
  /** Setzt ein Default-Flag exklusiv (alle anderen auf false). */
  clearDefault(kind: "incoming" | "outgoing"): Promise<void>;
  defaultOutgoing(): Promise<MailAccountRecord | null>;
}

export class MailAccountError extends Error {}

function toView(r: MailAccountRecord): MailAccountView {
  const { passwordEnc, ...rest } = r;
  return { ...rest, hasPassword: Boolean(passwordEnc) };
}

export class MailAccountService {
  /** `secretsKey` = 32-Byte-Schlüssel; null, wenn keiner konfiguriert ist (kein Passwort speicherbar). */
  constructor(
    private readonly repo: MailAccountRepository,
    private readonly secretsKey: Buffer | null
  ) {}

  async list(): Promise<MailAccountView[]> {
    return (await this.repo.list()).map(toView);
  }

  private encrypt(password: string | null | undefined): string | null | undefined {
    if (password === undefined) return undefined; // unverändert
    if (password === null || password === "") return null;
    if (!this.secretsKey) throw new MailAccountError("Kein SECRETS_KEY konfiguriert — Passwort kann nicht verschlüsselt gespeichert werden.");
    return encryptSecret(password, this.secretsKey);
  }

  async create(input: MailAccountInput): Promise<MailAccountView> {
    if (!input.name?.trim()) throw new MailAccountError("Name ist Pflicht.");
    if (!input.emailAddress?.trim()) throw new MailAccountError("E-Mail-Adresse ist Pflicht.");
    const passwordEnc = this.encrypt(input.password) ?? null;
    const created = await this.repo.create({
      name: input.name.trim(),
      emailAddress: input.emailAddress.trim().toLowerCase(),
      imapHost: input.imapHost?.trim() || "imap.ionos.de",
      imapPort: input.imapPort ?? 993,
      smtpHost: input.smtpHost?.trim() || "smtp.ionos.de",
      smtpPort: input.smtpPort ?? 587,
      username: input.username?.trim() || null,
      passwordEnc,
      enableIncoming: input.enableIncoming ?? true,
      enableOutgoing: input.enableOutgoing ?? true,
      defaultIncoming: false,
      defaultOutgoing: false,
      disabled: input.disabled ?? false,
    });
    // Default-Flags exklusiv setzen (nach dem Anlegen, damit clearDefault greift).
    if (input.defaultIncoming) await this.setDefault(created.id, "incoming");
    if (input.defaultOutgoing) await this.setDefault(created.id, "outgoing");
    const fresh = await this.repo.get(created.id);
    return toView(fresh ?? created);
  }

  async update(id: string, input: MailAccountInput): Promise<MailAccountView> {
    const existing = await this.repo.get(id);
    if (!existing) throw new MailAccountError(`Konto ${id} nicht gefunden.`);
    const passwordEnc = this.encrypt(input.password);
    const updated = await this.repo.update(id, {
      name: input.name?.trim() || existing.name,
      emailAddress: input.emailAddress?.trim().toLowerCase() || existing.emailAddress,
      imapHost: input.imapHost?.trim() || existing.imapHost,
      imapPort: input.imapPort ?? existing.imapPort,
      smtpHost: input.smtpHost?.trim() || existing.smtpHost,
      smtpPort: input.smtpPort ?? existing.smtpPort,
      username: input.username === undefined ? existing.username : (input.username?.trim() || null),
      ...(passwordEnc === undefined ? {} : { passwordEnc }),
      enableIncoming: input.enableIncoming ?? existing.enableIncoming,
      enableOutgoing: input.enableOutgoing ?? existing.enableOutgoing,
      disabled: input.disabled ?? existing.disabled,
    });
    if (input.defaultIncoming) await this.setDefault(id, "incoming");
    if (input.defaultOutgoing) await this.setDefault(id, "outgoing");
    return toView((await this.repo.get(id)) ?? updated);
  }

  async remove(id: string): Promise<void> {
    await this.repo.remove(id);
  }

  /** Setzt genau ein Konto als Standard ein-/ausgehend (alle anderen verlieren das Flag). */
  async setDefault(id: string, kind: "incoming" | "outgoing"): Promise<void> {
    const acc = await this.repo.get(id);
    if (!acc) throw new MailAccountError(`Konto ${id} nicht gefunden.`);
    await this.repo.clearDefault(kind);
    await this.repo.update(id, kind === "incoming" ? { defaultIncoming: true } : { defaultOutgoing: true });
  }

  /** SMTP-Konfiguration des ausgehenden Standardkontos (entschlüsselt) — oder null. */
  async defaultOutgoingConfig(): Promise<SmtpConfig | null> {
    const acc = await this.repo.defaultOutgoing();
    if (!acc || acc.disabled || !acc.enableOutgoing || !acc.passwordEnc) return null;
    if (!this.secretsKey) return null;
    return {
      host: acc.smtpHost,
      port: acc.smtpPort,
      secure: acc.smtpPort === 465,
      user: acc.username || acc.emailAddress,
      pass: decryptSecret(acc.passwordEnc, this.secretsKey),
      from: acc.emailAddress,
    };
  }
}
