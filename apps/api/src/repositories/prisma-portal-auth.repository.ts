// Prisma-Implementierung der Portal-Auth-Repositories (Produktionspfad, B13).

import { prisma } from "@texma/db";
import type {
  PortalSessionRepository,
  PortalUserRecord,
  PortalUserRepository,
} from "../modules/portal/portal-auth.service.js";

export class PrismaPortalUserRepository implements PortalUserRepository {
  async findByEmail(email: string): Promise<PortalUserRecord | null> {
    return prisma.portalUser.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, companyId: true, active: true, failedLoginCount: true, lockedUntil: true },
    });
  }

  async findById(id: string): Promise<PortalUserRecord | null> {
    return prisma.portalUser.findUnique({
      where: { id },
      select: { id: true, email: true, passwordHash: true, companyId: true, active: true, failedLoginCount: true, lockedUntil: true },
    });
  }

  async recordFailedLogin(id: string, lockedUntil: Date | null): Promise<void> {
    await prisma.portalUser.update({
      where: { id },
      data: { failedLoginCount: { increment: 1 }, lockedUntil },
    });
  }

  async resetLoginState(id: string, at: Date): Promise<void> {
    await prisma.portalUser.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: at },
    });
  }
}

export class PrismaPortalSessionRepository implements PortalSessionRepository {
  async create(input: { tokenHash: string; portalUserId: string; expiresAt: Date }): Promise<void> {
    await prisma.portalSession.create({ data: input });
  }

  async findByTokenHash(tokenHash: string): Promise<{ portalUserId: string; expiresAt: Date } | null> {
    return prisma.portalSession.findUnique({
      where: { tokenHash },
      select: { portalUserId: true, expiresAt: true },
    });
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await prisma.portalSession.deleteMany({ where: { tokenHash } });
  }
}
