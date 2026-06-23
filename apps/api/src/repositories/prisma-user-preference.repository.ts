// Prisma-Speicher für persönliche UI-Einstellungen (UserPreference, PK [userId, key]).

import { prisma } from "@texma/db";
import type { UserPreferenceRepository } from "../modules/preferences/preferences.service.js";

export class PrismaUserPreferenceRepository implements UserPreferenceRepository {
  async get(userId: string, key: string): Promise<string | null> {
    const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } } });
    return row?.value ?? null;
  }

  async set(userId: string, key: string, value: string): Promise<void> {
    await prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      update: { value },
      create: { userId, key, value },
    });
  }
}
