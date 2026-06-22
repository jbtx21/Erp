// Prisma-Implementierung der Firmen-Stammdaten (B3). Anlage löst die Preisgruppe
// über den Kind auf (legt sie bei Bedarf an), damit jede Preisgruppe wählbar ist.

import { prisma } from "@texma/db";
import type { PriceGroupKind } from "@texma/shared";
import type {
  CompanyRepository,
  CompanyRow,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../modules/company/company.service.js";

export class PrismaCompanyRepository implements CompanyRepository {
  async list(): Promise<CompanyRow[]> {
    const rows = await prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, branche: true, zahlungszielTage: true, mahnsperre: true, gesperrtAm: true, priceGroup: { select: { kind: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      branche: c.branche,
      zahlungszielTage: c.zahlungszielTage,
      mahnsperre: c.mahnsperre,
      priceGroupKind: c.priceGroup.kind as PriceGroupKind,
      gesperrt: c.gesperrtAm !== null,
    }));
  }

  async create(input: CreateCompanyInput): Promise<{ id: string }> {
    const pg = await prisma.priceGroup.upsert({
      where: { kind: input.priceGroupKind },
      update: {},
      create: { kind: input.priceGroupKind, name: input.priceGroupKind },
      select: { id: true },
    });
    return prisma.company.create({
      data: {
        name: input.name,
        branche: input.branche ?? null,
        zahlungszielTage: input.zahlungszielTage ?? 14,
        priceGroupId: pg.id,
      },
      select: { id: true },
    });
  }

  async update(input: UpdateCompanyInput): Promise<void> {
    await prisma.company.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.branche !== undefined ? { branche: input.branche } : {}),
        ...(input.zahlungszielTage !== undefined ? { zahlungszielTage: input.zahlungszielTage } : {}),
        ...(input.mahnsperre !== undefined ? { mahnsperre: input.mahnsperre } : {}),
      },
    });
  }
}
