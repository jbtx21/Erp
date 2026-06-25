// TEXMA MCP-Server (stdio, JSON-RPC 2.0). Dependency-frei: implementiert den minimalen
// Model-Context-Protocol-Handshake (initialize / tools/list / tools/call) und proxyt die
// Tools auf die read-only REST-Fassade (/api/v1) mit Bearer-PAT.
//
// Start:  API_URL=http://localhost:3000 TEXMA_PAT=texma_pat_... node dist/index.js
// In Claude Desktop als MCP-Server eintragen (command: node, args: [dist/index.js], env: …).

import { createInterface } from "node:readline";
import { TOOLS, callTool, type RestClient } from "./tools.js";

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PAT = process.env.TEXMA_PAT ?? "";

const restClient: RestClient = {
  async get(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${PAT}`, accept: "application/json" } });
    if (!res.ok) throw new Error(`REST ${path} → HTTP ${res.status}`);
    return res.json();
  },
};

interface RpcRequest { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> }

function send(msg: object): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}
function reply(id: RpcRequest["id"], result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}
function fail(id: RpcRequest["id"], code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(req: RpcRequest): Promise<void> {
  switch (req.method) {
    case "initialize":
      reply(req.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "texma-erp", version: "0.1.0" },
      });
      return;
    case "notifications/initialized":
      return; // Notification — keine Antwort
    case "ping":
      reply(req.id, {});
      return;
    case "tools/list":
      reply(req.id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      try {
        const data = await callTool(name, args, restClient);
        reply(req.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        reply(req.id, { content: [{ type: "text", text: `Fehler: ${(e as Error).message}` }], isError: true });
      }
      return;
    }
    default:
      if (req.id !== undefined) fail(req.id, -32601, `Methode nicht unterstützt: ${req.method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let req: RpcRequest;
  try { req = JSON.parse(text) as RpcRequest; } catch { return; }
  void handle(req).catch((e: unknown) => { if (req.id !== undefined) fail(req.id, -32603, (e as Error).message); });
});
