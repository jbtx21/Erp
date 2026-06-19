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

  it("löst die Identität aus einem OIDC-Bearer-Token auf (Sicherheits-Maxime)", async () => {
    // Injizierter Verifier statt echtem IdP — der Bearer-Pfad ersetzt die Cookie-Session.
    const verifier = {
      verify: async (token: string) =>
        token === "good"
          ? { id: "u-oidc", email: "o@texma.de", name: "OIDC", role: "BUERO" as const, totpEnabled: true }
          : Promise.reject(new Error("bad token")),
    };
    const server = buildServer({ identityVerifier: verifier });
    await server.ready();

    const ok = await server.inject({
      method: "GET",
      url: "/trpc/auth.me",
      headers: { authorization: "Bearer good" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().result.data).toMatchObject({ id: "u-oidc", role: "BUERO" });

    // Ohne gültiges Token bleibt der geschützte Endpunkt UNAUTHORIZED.
    const denied = await server.inject({ method: "GET", url: "/trpc/auth.me" });
    expect(denied.statusCode).toBe(401);
    await server.close();
  });
});
