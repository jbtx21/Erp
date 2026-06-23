// Connector-Plattform: zentrale Registry aller Fremdsystem-Anbindungen. Liefert den
// Katalog (@texma/shared) angereichert um Status (aktiv/konfiguriert), erlaubt das
// Konfigurieren der portal-pflegbaren Connectoren und einen Verbindungstest (Slack).

import { CONNECTOR_CATALOG, connectorDef, type ConnectorDef, type ConnectorKind } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface ConnectorStatus extends ConnectorDef {
  enabled: boolean;
  configured: boolean;
  /** Konfig-Werte (Geheimnisse maskiert). */
  config: Record<string, string>;
}

export interface IntegrationsRepository {
  get(kind: string): Promise<{ enabled: boolean; configJson: string | null } | null>;
  set(kind: string, enabled: boolean, configJson: string | null): Promise<void>;
  /** Ist der Connector via Umgebungsvariablen (Worker) konfiguriert? */
  envConfigured(kind: ConnectorKind): boolean;
}

/** Versendet eine Slack-Nachricht über einen Incoming-Webhook. */
export interface SlackSender {
  send(webhookUrl: string, text: string): Promise<void>;
}

export class IntegrationsError extends Error {}

const MASK = "••••••";

export class IntegrationsService {
  constructor(
    private readonly repo: IntegrationsRepository,
    private readonly audit: AuditSink,
    private readonly slack?: SlackSender
  ) {}

  /** Katalog + Status je Connector (Geheimnisse maskiert). */
  async list(): Promise<ConnectorStatus[]> {
    const out: ConnectorStatus[] = [];
    for (const def of CONNECTOR_CATALOG) {
      const row = await this.repo.get(def.kind);
      const cfg = row?.configJson ? (JSON.parse(row.configJson) as Record<string, string>) : {};
      const masked: Record<string, string> = {};
      for (const f of def.fields) {
        const v = cfg[f.key] ?? "";
        masked[f.key] = f.secret && v ? MASK : v;
      }
      const dbConfigured = def.fields.some((f) => (cfg[f.key] ?? "") !== "");
      out.push({ ...def, enabled: row?.enabled ?? false, configured: dbConfigured || this.repo.envConfigured(def.kind), config: masked });
    }
    return out;
  }

  /** Setzt Konfiguration + Aktivierung eines portal-pflegbaren Connectors. */
  async configure(kind: ConnectorKind, enabled: boolean, config: Record<string, string>): Promise<void> {
    const def = connectorDef(kind);
    if (!def) throw new IntegrationsError("Unbekannter Connector.");
    if (!def.portalConfigurable) throw new IntegrationsError(`${def.name} wird über die Worker-/ENV-Konfiguration verwaltet.`);
    // Maskierte Werte (unverändert gelassene Geheimnisse) nicht überschreiben.
    const existing = await this.repo.get(kind);
    const prev = existing?.configJson ? (JSON.parse(existing.configJson) as Record<string, string>) : {};
    const merged: Record<string, string> = { ...prev };
    for (const f of def.fields) {
      const v = config[f.key];
      if (v === undefined) continue;
      if (f.secret && v === MASK) continue; // unverändertes Geheimnis behalten
      merged[f.key] = v;
    }
    await this.repo.set(kind, enabled, JSON.stringify(merged));
    await this.audit.append(buildEntry({ entity: "IntegrationSetting", entityId: kind, action: "UPDATE", after: { enabled, fields: Object.keys(merged) } }));
  }

  /** Verbindungstest: derzeit Slack (sendet eine Testnachricht). */
  async test(kind: ConnectorKind): Promise<{ ok: boolean; message: string }> {
    if (kind !== "SLACK") throw new IntegrationsError("Test für diesen Connector nicht verfügbar.");
    if (!this.slack) throw new IntegrationsError("Slack-Sender nicht verfügbar.");
    const row = await this.repo.get("SLACK");
    const cfg = row?.configJson ? (JSON.parse(row.configJson) as Record<string, string>) : {};
    const url = cfg.webhookUrl;
    if (!url) throw new IntegrationsError("Keine Webhook-URL hinterlegt.");
    await this.slack.send(url, "✅ TEXMA ERP: Slack-Anbindung erfolgreich getestet.");
    return { ok: true, message: "Testnachricht an Slack gesendet." };
  }
}

/** Stub-Slack-Sender (kein Netzugang) — protokolliert. */
export class LoggingSlackSender implements SlackSender {
  public readonly sent: string[] = [];
  async send(_webhookUrl: string, text: string): Promise<void> {
    this.sent.push(text);
    // eslint-disable-next-line no-console
    console.log(`[Slack/STUB] ${text}`);
  }
}
