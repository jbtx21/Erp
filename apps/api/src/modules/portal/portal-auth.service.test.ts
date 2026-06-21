// Unit-Test der Portal-Auth (B13) — In-Memory, ohne DB. Kernzusicherungen:
// firmen-gescopte Session, Lockout, gehashte Tokens, generische Fehlermeldung.

import { describe, expect, it, beforeEach } from "vitest";
import { Argon2Hasher } from "../auth/password.js";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import {
  InMemoryPortalSessionRepository,
  InMemoryPortalUserRepository,
} from "../../repositories/in-memory-portal-auth.repository.js";
import { PortalAuthError, PortalAuthService } from "./portal-auth.service.js";

const hasher = new Argon2Hasher();
let users: InMemoryPortalUserRepository;
let sessions: InMemoryPortalSessionRepository;
let service: PortalAuthService;

async function seedUser(overrides: Partial<{ active: boolean; companyId: string }> = {}) {
  users.seed({
    id: "pu1",
    email: "kunde@acme.de",
    passwordHash: await hasher.hash("s3cret-pw"),
    companyId: overrides.companyId ?? "co-acme",
    active: overrides.active ?? true,
    failedLoginCount: 0,
    lockedUntil: null,
  });
}

beforeEach(() => {
  users = new InMemoryPortalUserRepository();
  sessions = new InMemoryPortalSessionRepository();
  service = new PortalAuthService(users, sessions, hasher, new MemoryAuditSink());
});

describe("PortalAuthService (B13)", () => {
  it("login mit korrektem Passwort liefert eine firmen-gescopte Session", async () => {
    await seedUser();
    const { token } = await service.login("kunde@acme.de", "s3cret-pw");
    const principal = await service.resolve(token);
    expect(principal).toMatchObject({ portalUserId: "pu1", companyId: "co-acme", email: "kunde@acme.de" });
  });

  it("falsches Passwort wirft generisch und sperrt nach 5 Fehlversuchen", async () => {
    await seedUser();
    for (let i = 0; i < 5; i++) {
      await expect(service.login("kunde@acme.de", "falsch")).rejects.toBeInstanceOf(PortalAuthError);
    }
    // Nach Lockout auch das KORREKTE Passwort abgewiesen (LOCKED).
    await expect(service.login("kunde@acme.de", "s3cret-pw")).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("unbekannter Nutzer wirft dieselbe generische Meldung (kein User-Enumeration)", async () => {
    await expect(service.login("nicht@da.de", "x")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("logout invalidiert die Session", async () => {
    await seedUser();
    const { token } = await service.login("kunde@acme.de", "s3cret-pw");
    await service.logout(token);
    expect(await service.resolve(token)).toBeNull();
  });

  it("inaktiver Nutzer kann sich nicht anmelden", async () => {
    await seedUser({ active: false });
    await expect(service.login("kunde@acme.de", "s3cret-pw")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});
