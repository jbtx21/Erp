// Boot-Smoke: der Fastify-Server startet inkl. tRPC-Plugin-Registrierung und
// antwortet auf /health. Nutzt fastify.inject() — kein Port, keine DB nötig.
import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("Fastify + tRPC Server", () => {
  it("bootet und antwortet auf /health", async () => {
    const server = buildServer();
    await server.ready();
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await server.close();
  });
});
