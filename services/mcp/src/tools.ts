// MCP-Tool-Definitionen + Dispatch (transport-unabhängig, testbar). Die Tools spiegeln die
// read-only REST-Fassade (/api/v1) — so erhält ein externer AI-Agent (z. B. Claude) sicheren,
// RBAC-gegateten Lesezugriff auf Aufträge, Bestand und Rechnungen.

/** Minimaler REST-Client (vom Transport mit Bearer-PAT befüllt). */
export interface RestClient {
  get(path: string): Promise<unknown>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export const TOOLS: McpTool[] = [
  {
    name: "list_orders",
    description: "Listet die letzten Aufträge (TEXMA ERP). Optional limit (1–200).",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "max. Anzahl (Default 50)" } } },
  },
  {
    name: "get_order",
    description: "Liefert einen Auftrag anhand seiner Belegnummer (z. B. AB-2026-0001).",
    inputSchema: { type: "object", properties: { number: { type: "string", description: "Auftrags-Belegnummer" } }, required: ["number"] },
  },
  {
    name: "list_stock",
    description: "Shop-Bestand je Variante (verfügbar, Puffer, an den Shop gemeldeter Bestand).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_invoices",
    description: "Listet die letzten Rechnungen (nur für Tokens mit Finanzberechtigung). Optional limit.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
];

const q = (limit: unknown): string => {
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? `?limit=${Math.min(200, Math.trunc(n))}` : "";
};

/** Führt ein Tool gegen die REST-Fassade aus und liefert das Roh-Ergebnis (JSON). */
export async function callTool(name: string, args: Record<string, unknown>, client: RestClient): Promise<unknown> {
  switch (name) {
    case "list_orders":
      return client.get(`/api/v1/orders${q(args.limit)}`);
    case "get_order": {
      const number = String(args.number ?? "").trim();
      if (!number) throw new Error("number ist erforderlich.");
      return client.get(`/api/v1/orders/${encodeURIComponent(number)}`);
    }
    case "list_stock":
      return client.get(`/api/v1/stock`);
    case "list_invoices":
      return client.get(`/api/v1/invoices${q(args.limit)}`);
    default:
      throw new Error(`Unbekanntes Tool: ${name}`);
  }
}
