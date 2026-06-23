// Prisma-Integrations-Registry. envConfigured prüft die einschlägigen ENV-Variablen
// der Worker-/Server-Connectoren (Brevo/Hubspot bereits verdrahtet).

import { prisma } from "@texma/db";
import type { ConnectorKind } from "@texma/shared";
import type { IntegrationsRepository } from "../modules/integrations/integrations.service.js";

const ENV_BY_KIND: Partial<Record<ConnectorKind, string>> = {
  BREVO: "BREVO_API_KEY",
  HUBSPOT: "HUBSPOT_TOKEN",
  WOOCOMMERCE: "API_URL",
};

export class PrismaIntegrationsRepository implements IntegrationsRepository {
  async get(kind: string): Promise<{ enabled: boolean; configJson: string | null } | null> {
    const row = await prisma.integrationSetting.findUnique({ where: { kind } });
    return row ? { enabled: row.enabled, configJson: row.configJson } : null;
  }
  async set(kind: string, enabled: boolean, configJson: string | null): Promise<void> {
    await prisma.integrationSetting.upsert({ where: { kind }, update: { enabled, configJson }, create: { kind, enabled, configJson } });
  }
  envConfigured(kind: ConnectorKind): boolean {
    const envVar = ENV_BY_KIND[kind];
    return envVar ? Boolean(process.env[envVar]) : false;
  }
}
