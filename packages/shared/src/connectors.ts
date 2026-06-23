// Connector-Plattform / Integrations-Registry (à la Xentral Connect): ein zentraler
// Katalog aller anbindbaren Fremdsysteme mit Kategorie + benötigten Konfig-Feldern.
// Rein/IO-frei — der Status (konfiguriert/aktiv) kommt zur Laufzeit aus dem Service.

export type ConnectorKind =
  | "WOOCOMMERCE"
  | "DPD"
  | "BREVO"
  | "HUBSPOT"
  | "SLACK"
  | "SUPPLIER"
  | "CALDAV";

export type ConnectorCategory = "SHOP" | "VERSAND" | "MARKETING" | "CRM" | "KOMMUNIKATION" | "BESCHAFFUNG" | "KALENDER";

export interface ConnectorField {
  key: string;
  label: string;
  /** Geheimnis (maskiert anzeigen, verschlüsselt ablegen). */
  secret?: boolean;
}

export interface ConnectorDef {
  kind: ConnectorKind;
  name: string;
  category: ConnectorCategory;
  description: string;
  fields: ConnectorField[];
  /** Direkt im Portal konfigurierbar (true) oder nur per ENV/Worker (false). */
  portalConfigurable: boolean;
}

export const CONNECTOR_CATALOG: ReadonlyArray<ConnectorDef> = [
  { kind: "WOOCOMMERCE", name: "WooCommerce", category: "SHOP", description: "Shop-Bestellungen importieren, Preise/Tracking zurückschreiben (T-01/T-08/T-09).", portalConfigurable: false,
    fields: [{ key: "baseUrl", label: "Shop-URL" }, { key: "consumerKey", label: "Consumer Key" }, { key: "consumerSecret", label: "Consumer Secret", secret: true }] },
  { kind: "DPD", name: "DPD Versand", category: "VERSAND", description: "Versandlabels + Tracking (T-06).", portalConfigurable: false,
    fields: [{ key: "apiUrl", label: "API-URL" }, { key: "token", label: "Token", secret: true }] },
  { kind: "BREVO", name: "Brevo (Newsletter)", category: "MARKETING", description: "Newsletter-Kampagnen an Opt-in-Kontakte.", portalConfigurable: true,
    fields: [{ key: "apiKey", label: "API-Key", secret: true }, { key: "senderEmail", label: "Absender-E-Mail" }] },
  { kind: "HUBSPOT", name: "HubSpot (CRM)", category: "CRM", description: "Verkaufschancen als Deals spiegeln.", portalConfigurable: true,
    fields: [{ key: "token", label: "Private-App-Token", secret: true }] },
  { kind: "SLACK", name: "Slack", category: "KOMMUNIKATION", description: "Benachrichtigungen in einen Slack-Kanal (Incoming Webhook).", portalConfigurable: true,
    fields: [{ key: "webhookUrl", label: "Incoming-Webhook-URL", secret: true }] },
  { kind: "SUPPLIER", name: "Lieferanten-Katalog", category: "BESCHAFFUNG", description: "Katalog/Lager/EK von Lieferanten eingehend (ID Identity, Stanley/Stella …).", portalConfigurable: false,
    fields: [{ key: "baseUrl", label: "API-URL" }, { key: "consumerKey", label: "Key" }, { key: "consumerSecret", label: "Secret", secret: true }] },
  { kind: "CALDAV", name: "Kalender-Sync (CalDAV)", category: "KALENDER", description: "Büro-Kalender mit CalDAV/Google synchronisieren.", portalConfigurable: true,
    fields: [{ key: "url", label: "CalDAV-URL" }, { key: "user", label: "Benutzer" }, { key: "password", label: "Passwort", secret: true }] },
];

const BY_KIND = new Map(CONNECTOR_CATALOG.map((c) => [c.kind, c]));
export function connectorDef(kind: ConnectorKind): ConnectorDef | undefined {
  return BY_KIND.get(kind);
}
