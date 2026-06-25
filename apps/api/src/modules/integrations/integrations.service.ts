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

/**
 * SSRF-Schutz (Kap. 28): die Slack-Webhook-URL ist admin-pflegbar und wird serverseitig
 * angefragt. Ohne Allowlist könnte ein böswilliger/kompromittierter ADMIN den Server gegen
 * interne Ziele (Cloud-Metadata 169.254.169.254, localhost, interne Ports) feuern lassen.
 * Daher: nur https und exakt der offizielle Slack-Webhook-Host.
 */
export function isAllowedSlackWebhook(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

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
    // SSRF-Schutz: Slack-Webhook-Ziel gegen Allowlist prüfen (nur https://hooks.slack.com).
    if (kind === "SLACK" && merged.webhookUrl && !isAllowedSlackWebhook(merged.webhookUrl)) {
      throw new IntegrationsError("Ungültige Slack-Webhook-URL (erwartet https://hooks.slack.com/…).");
    }
    await this.repo.set(kind, enabled, JSON.stringify(merged));
    await this.audit.append(buildEntry({ entity: "IntegrationSetting", entityId: kind, action: "UPDATE", after: { enabled, fields: Object.keys(merged) } }));
  }

  /**
   * Verbindungstest. Slack sendet eine echte Testnachricht (portal-pflegbar). Die im
   * Worker-Tier laufenden Connectoren (WooCommerce/DPD/Lieferanten) macht apps/api
   * bewusst NICHT selbst nach außen (kein ausgehender HTTP-Call im Request, Kap. 13/32) —
   * hier prüfen wir die Konfigurations-Bereitschaft (ENV/DB + aktiv) und melden sie zurück.
   * Der reale End-to-End-Poll bleibt dem Worker vorbehalten.
   */
  async test(kind: ConnectorKind): Promise<{ ok: boolean; message: string }> {
    const def = connectorDef(kind);
    if (!def) throw new IntegrationsError("Unbekannter Connector.");

    if (kind === "SLACK") {
      if (!this.slack) throw new IntegrationsError("Slack-Sender nicht verfügbar.");
      const row = await this.repo.get("SLACK");
      const cfg = row?.configJson ? (JSON.parse(row.configJson) as Record<string, string>) : {};
      const url = cfg.webhookUrl;
      if (!url) throw new IntegrationsError("Keine Webhook-URL hinterlegt.");
      // SSRF-Schutz auch hier defensiv (falls Altbestand vor der Validierung gespeichert wurde).
      if (!isAllowedSlackWebhook(url)) throw new IntegrationsError("Ungültige Slack-Webhook-URL (erwartet https://hooks.slack.com/…).");
      await this.slack.send(url, "✅ TEXMA ERP: Slack-Anbindung erfolgreich getestet.");
      return { ok: true, message: "Testnachricht an Slack gesendet." };
    }

    // Bereitschaftscheck für die Worker-/portal-pflegbaren Connectoren.
    const row = await this.repo.get(kind);
    const cfg = row?.configJson ? (JSON.parse(row.configJson) as Record<string, string>) : {};
    const dbConfigured = def.fields.some((f) => (cfg[f.key] ?? "") !== "");
    const envConfigured = this.repo.envConfigured(kind);
    if (!dbConfigured && !envConfigured) {
      return { ok: false, message: `${def.name} ist nicht konfiguriert (weder Portal noch Worker/ENV).` };
    }
    const quelle = dbConfigured ? "Portal" : "Worker/ENV";
    const aktiv = def.portalConfigurable ? (row?.enabled ?? false) : true;
    return {
      ok: true,
      message: `${def.name} ist konfiguriert (${quelle})${aktiv ? " und aktiv" : ", aber nicht aktiviert"}. Der reale Verbindungsabruf läuft im Worker-Tier.`,
    };
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
