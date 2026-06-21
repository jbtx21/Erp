// Auth-Anwendungsfall (Kap. 12/14): Login + Session, TOTP-2FA (optional pro Nutzer),
// Lockout nach Fehlversuchen, GoBD-Audit. IO über Repository-Interfaces → testbar ohne DB.

import { type AuditSink, buildEntry } from "@texma/audit";
import type { Role } from "@texma/shared";
import type { Hasher } from "./password.js";
import type { TotpService } from "./totp.js";
import { hashToken, randomToken } from "./token.js";

export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 h
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  active: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface SessionRecord {
  userId: string;
  expiresAt: Date;
  pendingTotp: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  totpEnabled: boolean;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  recordFailedLogin(userId: string, lockedUntil: Date | null): Promise<void>;
  resetLoginState(userId: string): Promise<void>;
  setTotpSecret(userId: string, secret: string): Promise<void>;
  enableTotp(userId: string): Promise<void>;
}

export interface SessionRepository {
  create(input: { tokenHash: string; userId: string; expiresAt: Date; pendingTotp: boolean }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  markTotpVerified(tokenHash: string): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

export type AuthErrorCode = "INVALID_CREDENTIALS" | "LOCKED" | "INVALID_TOTP" | "NO_SESSION";

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface LoginResult {
  token: string;
  needsTotp: boolean;
  expiresAt: Date;
}

function toAuthUser(u: UserRecord): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, totpEnabled: u.totpEnabled };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly audit: AuditSink,
    private readonly hasher: Hasher,
    private readonly totp: TotpService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || !user.active) {
      await this.auditAttempt(email, "user_not_found");
      throw new AuthError("INVALID_CREDENTIALS", "Ungültige Anmeldedaten.");
    }
    if (user.lockedUntil && user.lockedUntil > this.now()) {
      throw new AuthError("LOCKED", "Konto vorübergehend gesperrt. Bitte später erneut versuchen.");
    }

    const ok = await this.hasher.verify(user.passwordHash, password);
    if (!ok) {
      const nextCount = user.failedLoginCount + 1;
      const lockedUntil =
        nextCount >= MAX_FAILED ? new Date(this.now().getTime() + LOCK_MINUTES * 60_000) : null;
      await this.users.recordFailedLogin(user.id, lockedUntil);
      await this.auditAttempt(email, "bad_password", user.id);
      throw new AuthError("INVALID_CREDENTIALS", "Ungültige Anmeldedaten.");
    }

    await this.users.resetLoginState(user.id);
    const token = randomToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_SECONDS * 1000);
    await this.sessions.create({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt,
      pendingTotp: user.totpEnabled,
    });
    await this.audit.append(
      buildEntry({ userId: user.id, entity: "Session", entityId: user.id, action: "CREATE", after: { needsTotp: user.totpEnabled } })
    );
    return { token, needsTotp: user.totpEnabled, expiresAt };
  }

  async verifyTotp(token: string, code: string): Promise<void> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session || session.expiresAt <= this.now()) {
      throw new AuthError("NO_SESSION", "Keine gültige Sitzung.");
    }
    const user = await this.users.findById(session.userId);
    if (!user?.totpSecret || !this.totp.verify(code, user.totpSecret)) {
      await this.auditAttempt(user?.email ?? session.userId, "bad_totp", session.userId);
      throw new AuthError("INVALID_TOTP", "Falscher 2FA-Code.");
    }
    await this.sessions.markTotpVerified(hashToken(token));
    await this.audit.append(
      buildEntry({ userId: user.id, entity: "Session", entityId: user.id, action: "UPDATE", after: { totpVerified: true } })
    );
  }

  /** Liefert den eingeloggten Nutzer für den tRPC-Context (oder null). */
  async resolveSession(token: string): Promise<AuthUser | null> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session || session.expiresAt <= this.now() || session.pendingTotp) return null;
    const user = await this.users.findById(session.userId);
    return user && user.active ? toAuthUser(user) : null;
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashToken(token));
  }

  async setupTotp(userId: string): Promise<{ secret: string; keyUri: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new AuthError("NO_SESSION", "Unbekannter Nutzer.");
    const secret = this.totp.generateSecret();
    await this.users.setTotpSecret(user.id, secret);
    return { secret, keyUri: this.totp.keyUri(user.email, secret) };
  }

  async enableTotp(userId: string, code: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user?.totpSecret || !this.totp.verify(code, user.totpSecret)) {
      throw new AuthError("INVALID_TOTP", "Falscher 2FA-Code.");
    }
    await this.users.enableTotp(user.id);
    await this.audit.append(
      buildEntry({ userId: user.id, entity: "User", entityId: user.id, action: "UPDATE", after: { totpEnabled: true } })
    );
  }

  private async auditAttempt(email: string, reason: string, userId?: string): Promise<void> {
    await this.audit.append(
      buildEntry({ userId, entity: "LoginAttempt", entityId: email, action: "CREATE", after: { success: false, reason } })
    );
  }
}
