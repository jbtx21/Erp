// Integrationstest gegen echtes Postgres: voller HTTP-Auth-Flow über den Fastify-
// Server (Login → Set-Cookie → me). Opt-in via RUN_DB_TESTS=1, sonst Skip.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@texma/db";
import { buildServer } from "../../server.js";
import { Argon2Hasher } from "./password.js";

const dbConfigured = process.env.RUN_DB_TESTS === "1";
const EMAIL = "admin@texma.de";
const PASSWORD = "Passw0rt!";

if (!dbConfigured) {
  describe.skip("Auth-HTTP-Flow (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("Auth-HTTP-Flow gegen echtes Postgres", () => {
    let server: FastifyInstance;

    beforeAll(async () => {
      await prisma.session.deleteMany({});
      await prisma.user.deleteMany({ where: { email: EMAIL } });
      await prisma.user.create({
        data: { email: EMAIL, name: "Admin", role: "ADMIN", passwordHash: await new Argon2Hasher().hash(PASSWORD) },
      });
      server = buildServer();
      await server.ready();
    });

    afterAll(async () => {
      await prisma.session.deleteMany({});
      await prisma.user.deleteMany({ where: { email: EMAIL } });
      await server.close();
      await prisma.$disconnect();
    });

    it("Login setzt ein httpOnly-Cookie und me liefert den Nutzer", async () => {
      const login = await server.inject({
        method: "POST",
        url: "/trpc/auth.login",
        payload: { email: EMAIL, password: PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      const sid = login.cookies.find((c) => c.name === "sid");
      expect(sid?.httpOnly).toBe(true);
      expect(sid?.value).toBeTruthy();

      const me = await server.inject({
        method: "GET",
        url: "/trpc/auth.me",
        headers: { cookie: `sid=${sid!.value}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().result.data).toMatchObject({ email: EMAIL, role: "ADMIN" });
    });

    it("falsches Passwort wird abgewiesen (UNAUTHORIZED)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/trpc/auth.login",
        payload: { email: EMAIL, password: "falsch" },
      });
      expect(res.statusCode).toBe(401);
    });
  });
}
