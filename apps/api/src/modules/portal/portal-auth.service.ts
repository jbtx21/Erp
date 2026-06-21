// Kundenportal-Authentifizierung (B13, Kap. 36). VOLLSTÄNDIG getrennt vom Mitarbeiter-
// Login: eigene PortalUser/PortalSession. Jede Session ist an die Firma des Logins
// gebunden — die Portal-API leitet die Mandanten-Isolation NUR aus dieser companyId
// ab (nie aus Request-Parametern). Token: Zufalls-Klartext im httpOnly-Cookie,
// SHA-256-Hash in der DB. Lockout nach zu vielen Fehlversuchen (Kap. 14).

import { hashToken, randomToken } from "../auth/token.js";
import type { Hasher } from "../auth/password.js";
import { buildEntry, type AuditSink } from "@texma/audit";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 Tage
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface PortalUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  companyId: string;
  active: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface PortalPrincipal {
  portalUserId: string;
  companyId: string;
  email: string;
}

export interface PortalUserRepository {
  findByEmail(email: string): Promise<PortalUserRecord | null>;
  findById(id: string): Promise<PortalUserRecord | null>;
  recordFailedLogin(id: string, lockedUntil: Date | null): Promise<void>;
  resetLoginState(id: string, at: Date): Promise<void>;
}

export interface PortalSessionRepository {
  create(input: { tokenHash: string; portalUserId: string; expiresAt: Date }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<{ portalUserId: string; expiresAt: Date } | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

export type PortalAuthErrorCode = "INVALID_CREDENTIALS" | "LOCKED";

export class PortalAuthError extends Error {
  constructor(readonly code: PortalAuthErrorCode, message: string) {
    super(message);
    this.name = "PortalAuthError";
  }
}

export interface PortalLoginResult {
  token: string;
  expiresAt: Date;
  maxAgeSeconds: number;
}

export class PortalAuthService {
  constructor(
    private readonly users: PortalUserRepository,
    private readonly sessions: PortalSessionRepository,
    private readonly hasher: Hasher,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Login → firmen-gescopte Session. Generische Fehlermeldung (kein User-Enumeration). */
  async login(email: string, password: string): Promise<PortalLoginResult> {
    const user = await this.users.findByEmail(email.toLowerCase().trim());
    if (!user || !user.active) {
      await this.auditFail(email, "user_not_found");
      throw new PortalAuthError("INVALID_CREDENTIALS", "Ungültige Anmeldedaten.");
    }
    if (user.lockedUntil && user.lockedUntil > this.now()) {
      throw new PortalAuthError("LOCKED", "Konto vorübergehend gesperrt. Bitte später erneut versuchen.");
    }

    const ok = await this.hasher.verify(user.passwordHash, password);
    if (!ok) {
      const nextCount = user.failedLoginCount + 1;
      const lockedUntil =
        nextCount >= MAX_FAILED ? new Date(this.now().getTime() + LOCK_MINUTES * 60_000) : null;
      await this.users.recordFailedLogin(user.id, lockedUntil);
      await this.auditFail(email, "bad_password", user.id);
      throw new PortalAuthError("INVALID_CREDENTIALS", "Ungültige Anmeldedaten.");
    }

    await this.users.resetLoginState(user.id, this.now());
    const token = randomToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_SECONDS * 1000);
    await this.sessions.create({ tokenHash: hashToken(token), portalUserId: user.id, expiresAt });
    await this.audit.append(
      buildEntry({ entity: "PortalSession", entityId: user.id, action: "CREATE", after: { companyId: user.companyId } })
    );
    return { token, expiresAt, maxAgeSeconds: SESSION_TTL_SECONDS };
  }

  /** Auflösung für den Portal-Context: firmen-gescopter Principal oder null. */
  async resolve(token: string): Promise<PortalPrincipal | null> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session || session.expiresAt <= this.now()) return null;
    const user = await this.users.findById(session.portalUserId);
    if (!user || !user.active) return null;
    return { portalUserId: user.id, companyId: user.companyId, email: user.email };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashToken(token));
  }

  private async auditFail(email: string, reason: string, portalUserId?: string): Promise<void> {
    await this.audit.append(
      buildEntry({ entity: "PortalLoginAttempt", entityId: email, action: "CREATE", after: { success: false, reason, portalUserId } })
    );
  }
}
