// Prisma-User/Session-Repos (Produktionspfad) für den AuthService.
import { prisma } from "@texma/db";
import type { Role } from "@texma/shared";
import type {
  SessionRecord,
  SessionRepository,
  UserListRow,
  UserRecord,
  UserRepository,
} from "../modules/auth/auth.service.js";

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.map(await prisma.user.findUnique({ where: { email } }));
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.map(await prisma.user.findUnique({ where: { id } }));
  }
  async recordFailedLogin(userId: string, lockedUntil: Date | null): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 }, lockedUntil },
    });
  }
  async resetLoginState(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }
  async setTotpSecret(userId: string, secret: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
  }
  async enableTotp(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  }
  async create(input: { email: string; name: string; role: Role; passwordHash: string }): Promise<{ id: string }> {
    return prisma.user.create({ data: { email: input.email, name: input.name, role: input.role as never, passwordHash: input.passwordHash }, select: { id: true } });
  }
  async list(): Promise<UserListRow[]> {
    const rows = await prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true, name: true, role: true, totpEnabled: true, active: true } });
    return rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role as Role, totpEnabled: u.totpEnabled, active: u.active }));
  }
  async setActive(userId: string, active: boolean): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { active } });
  }

  private map(u: Awaited<ReturnType<typeof prisma.user.findUnique>>): UserRecord | null {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role as Role,
      passwordHash: u.passwordHash,
      totpSecret: u.totpSecret,
      totpEnabled: u.totpEnabled,
      active: u.active,
      failedLoginCount: u.failedLoginCount,
      lockedUntil: u.lockedUntil,
    };
  }
}

export class PrismaSessionRepository implements SessionRepository {
  async create(input: { tokenHash: string; userId: string; expiresAt: Date; pendingTotp: boolean }): Promise<void> {
    await prisma.session.create({ data: input });
  }
  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const s = await prisma.session.findUnique({ where: { tokenHash } });
    return s ? { userId: s.userId, expiresAt: s.expiresAt, pendingTotp: s.pendingTotp } : null;
  }
  async markTotpVerified(tokenHash: string): Promise<void> {
    await prisma.session.update({ where: { tokenHash }, data: { pendingTotp: false } });
  }
  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await prisma.session.deleteMany({ where: { tokenHash } });
  }
}
