// Router-Test des Kundenportals (B13) via tRPC-Caller — ohne HTTP/DB. Kern:
// Unauthentifiziert kein Zugriff; myOrders liefert nur die EIGENE Firma (Mandanten-
// Isolation), Scope kommt aus der Session, nicht aus dem Request.

import { describe, expect, it } from "vitest";
import { Argon2Hasher } from "../modules/auth/password.js";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import {
  InMemoryPortalSessionRepository,
  InMemoryPortalUserRepository,
} from "../repositories/in-memory-portal-auth.repository.js";
import { InMemoryPortalRepository } from "../repositories/in-memory-portal.repository.js";
import { PortalAuthService } from "../modules/portal/portal-auth.service.js";
import { CustomerPortalService } from "../modules/portal/portal.service.js";
import { portalAppRouter } from "./portal-router.js";
import { portalCreateCallerFactory, type PortalContext } from "./portal-trpc.js";

const createCaller = portalCreateCallerFactory(portalAppRouter);

async function buildContext(principalCompanyId: string | null) {
  const hasher = new Argon2Hasher();
  const users = new InMemoryPortalUserRepository();
  users.seed({
    id: "pu1",
    email: "kunde@acme.de",
    passwordHash: await hasher.hash("pw"),
    companyId: "co-a",
    active: true,
    failedLoginCount: 0,
    lockedUntil: null,
  });
  const portalAuth = new PortalAuthService(users, new InMemoryPortalSessionRepository(), hasher, new MemoryAuditSink());
  const portalRepo = new InMemoryPortalRepository([
    { companyId: "co-a", number: "AB-A1", status: "IN_PRODUKTION", zugesagterLiefertermin: null, trackingNumber: "DPD-1", createdAt: new Date() },
    { companyId: "co-b", number: "AB-B1", status: "ANGELEGT", zugesagterLiefertermin: null, trackingNumber: null, createdAt: new Date() },
  ]);
  const ctx: PortalContext = {
    portalAuth,
    portal: new CustomerPortalService(portalRepo),
    principal: principalCompanyId ? { portalUserId: "pu1", companyId: principalCompanyId, email: "kunde@acme.de" } : null,
    sessionToken: null,
    setSessionCookie: () => {},
    clearSessionCookie: () => {},
  };
  return ctx;
}

describe("portalAppRouter (B13)", () => {
  it("verweigert myOrders/me ohne Session", async () => {
    const caller = createCaller(await buildContext(null));
    await expect(caller.myOrders()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("myOrders liefert nur die Aufträge der eigenen Firma (Scope aus Session)", async () => {
    const caller = createCaller(await buildContext("co-a"));
    const orders = await caller.myOrders();
    expect(orders.map((o) => o.number)).toEqual(["AB-A1"]);
    expect(orders.some((o) => o.number === "AB-B1")).toBe(false);
  });

  it("login mit falschem Passwort wirft UNAUTHORIZED", async () => {
    const caller = createCaller(await buildContext(null));
    await expect(caller.login({ email: "kunde@acme.de", password: "falsch" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("login mit korrektem Passwort setzt eine Session", async () => {
    const ctx = await buildContext(null);
    let cookieSet = false;
    ctx.setSessionCookie = () => { cookieSet = true; };
    const caller = createCaller(ctx);
    expect(await caller.login({ email: "kunde@acme.de", password: "pw" })).toEqual({ ok: true });
    expect(cookieSet).toBe(true);
  });
});
