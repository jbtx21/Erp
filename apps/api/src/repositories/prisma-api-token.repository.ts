import { prisma } from "@texma/db";
import type { Role } from "@texma/shared";
import type { ApiTokenRecord, ApiTokenRepository } from "../modules/api-token/api-token.service.js";

const VIEW = { id: true, name: true, role: true, lastUsedAt: true, revokedAt: true, createdAt: true } as const;

export class PrismaApiTokenRepository implements ApiTokenRepository {
  async create(input: { name: string; tokenHash: string; role: Role }): Promise<ApiTokenRecord> {
    return prisma.apiToken.create({ data: input, select: VIEW }) as Promise<ApiTokenRecord>;
  }
  async list(): Promise<ApiTokenRecord[]> {
    return prisma.apiToken.findMany({ orderBy: { createdAt: "desc" }, select: VIEW }) as Promise<ApiTokenRecord[]>;
  }
  async findActiveByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    return prisma.apiToken.findFirst({ where: { tokenHash, revokedAt: null }, select: VIEW }) as Promise<ApiTokenRecord | null>;
  }
  async revoke(id: string, at: Date): Promise<void> {
    await prisma.apiToken.update({ where: { id }, data: { revokedAt: at } });
  }
  async touch(id: string, at: Date): Promise<void> {
    await prisma.apiToken.update({ where: { id }, data: { lastUsedAt: at } });
  }
}
