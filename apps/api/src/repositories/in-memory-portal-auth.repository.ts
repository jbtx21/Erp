// In-Memory-Portal-Auth-Repositories für Unit-Tests/Dev.

import type {
  PortalSessionRepository,
  PortalUserRecord,
  PortalUserRepository,
} from "../modules/portal/portal-auth.service.js";

export class InMemoryPortalUserRepository implements PortalUserRepository {
  private readonly users = new Map<string, PortalUserRecord>();

  seed(user: PortalUserRecord): void {
    this.users.set(user.id, user);
  }

  async findByEmail(email: string): Promise<PortalUserRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<PortalUserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async recordFailedLogin(id: string, lockedUntil: Date | null): Promise<void> {
    const u = this.users.get(id);
    if (!u) return;
    u.failedLoginCount += 1;
    u.lockedUntil = lockedUntil;
  }

  async resetLoginState(id: string): Promise<void> {
    const u = this.users.get(id);
    if (!u) return;
    u.failedLoginCount = 0;
    u.lockedUntil = null;
  }
}

export class InMemoryPortalSessionRepository implements PortalSessionRepository {
  private readonly sessions = new Map<string, { portalUserId: string; expiresAt: Date }>();

  async create(input: { tokenHash: string; portalUserId: string; expiresAt: Date }): Promise<void> {
    this.sessions.set(input.tokenHash, { portalUserId: input.portalUserId, expiresAt: input.expiresAt });
  }

  async findByTokenHash(tokenHash: string): Promise<{ portalUserId: string; expiresAt: Date } | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}
