import { describe, expect, it } from "vitest";
import { TOOLS, callTool, type RestClient } from "./tools.js";

function fakeClient(): { client: RestClient; calls: string[] } {
  const calls: string[] = [];
  return { calls, client: { async get(path) { calls.push(path); return { path }; } } };
}

describe("MCP-Tools", () => {
  it("definiert die read-only Tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["list_orders", "get_order", "list_stock", "list_invoices"]);
    expect(TOOLS.find((t) => t.name === "get_order")?.inputSchema.required).toContain("number");
  });

  it("mappt Tools auf die REST-Pfade", async () => {
    const { client, calls } = fakeClient();
    await callTool("list_orders", { limit: 5 }, client);
    await callTool("get_order", { number: "AB-2026-0001" }, client);
    await callTool("list_stock", {}, client);
    await callTool("list_invoices", {}, client);
    expect(calls).toEqual(["/api/v1/orders?limit=5", "/api/v1/orders/AB-2026-0001", "/api/v1/stock", "/api/v1/invoices"]);
  });

  it("verlangt eine Belegnummer für get_order", async () => {
    const { client } = fakeClient();
    await expect(callTool("get_order", {}, client)).rejects.toThrow(/number/);
  });

  it("wirft bei unbekanntem Tool", async () => {
    const { client } = fakeClient();
    await expect(callTool("delete_everything", {}, client)).rejects.toThrow(/Unbekanntes Tool/);
  });
});
