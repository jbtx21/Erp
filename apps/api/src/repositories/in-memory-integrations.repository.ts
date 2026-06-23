// In-Memory-Integrations-Registry für Tests.

import type { ConnectorKind } from "@texma/shared";
import type { IntegrationsRepository } from "../modules/integrations/integrations.service.js";

export class InMemoryIntegrationsRepository implements IntegrationsRepository {
  private rows = new Map<string, { enabled: boolean; configJson: string | null }>();
  envKinds = new Set<ConnectorKind>();

  async get(kind: string): Promise<{ enabled: boolean; configJson: string | null } | null> {
    return this.rows.get(kind) ?? null;
  }
  async set(kind: string, enabled: boolean, configJson: string | null): Promise<void> {
    this.rows.set(kind, { enabled, configJson });
  }
  envConfigured(kind: ConnectorKind): boolean { return this.envKinds.has(kind); }
}
