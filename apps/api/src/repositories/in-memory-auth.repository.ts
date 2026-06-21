// In-Memory-User/Session-Repos für Auth-Tests (ohne DB).
import type {
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from "../modules/auth/auth.service.js";

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly users: UserRecord[]) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async recordFailedLogin(userId: string, lockedUntil: Date | null): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.failedLoginCount += 1;
      u.lockedUntil = lockedUntil;
    }
  }
  async resetLoginState(userId: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.failedLoginCount = 0;
      u.lockedUntil = null;
    }
  }
  async setTotpSecret(userId: string, secret: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.totpSecret = secret;
  }
  async enableTotp(userId: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.totpEnabled = true;
  }
}

interface StoredSession extends SessionRecord {
  tokenHash: string;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, StoredSession>();

  async create(input: { tokenHash: string; userId: string; expiresAt: Date; pendingTotp: boolean }): Promise<void> {
    this.sessions.set(input.tokenHash, { ...input });
  }
  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.get(tokenHash) ?? null;
  }
  async markTotpVerified(tokenHash: string): Promise<void> {
    const s = this.sessions.get(tokenHash);
    if (s) s.pendingTotp = false;
  }
  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}
