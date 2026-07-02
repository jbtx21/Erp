import { Secret, TOTP } from "otpauth";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import {
  InMemoryPasswordResetRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "../../repositories/in-memory-auth.repository.js";
import { AuthError, AuthService, type UserRecord } from "./auth.service.js";
import { Argon2Hasher } from "./password.js";
import { OtpauthTotpService } from "./totp.js";

const hasher = new Argon2Hasher();
const totp = new OtpauthTotpService();

/** Erzeugt einen gültigen TOTP-Code zum gespeicherten base32-Secret (Defaults wie im Service). */
const totpCode = (secret: string): string => new TOTP({ secret: Secret.fromBase32(secret) }).generate();

async function makeUser(over: Partial<UserRecord> = {}): Promise<UserRecord> {
  return {
    id: "u1",
    email: "büro@texma.de".toLowerCase(),
    name: "Büro",
    role: "BUERO",
    passwordHash: await hasher.hash("geheim123"),
    totpSecret: null,
    totpEnabled: false,
    active: true,
    failedLoginCount: 0,
    lockedUntil: null,
    tenantId: null,
    ...over,
  };
}

function setup(users: UserRecord[]) {
  const userRepo = new InMemoryUserRepository(users);
  const sessionRepo = new InMemorySessionRepository();
  const audit = new MemoryAuditSink();
  const service = new AuthService(userRepo, sessionRepo, audit, hasher, totp);
  return { service, userRepo, sessionRepo, audit };
}

describe("AuthService", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeUser();
  });

  it("Login mit korrektem Passwort erzeugt eine Session (ohne 2FA)", async () => {
    const { service } = setup([user]);
    const res = await service.loginWithPassword(user.email, "geheim123");
    expect(res.needsTotp).toBe(false);
    expect(res.token).toBeTruthy();
    expect(await service.resolveSession(res.token)).toMatchObject({ id: "u1", role: "BUERO" });
  });

  it("falsches Passwort wirft INVALID_CREDENTIALS und zählt Fehlversuche", async () => {
    const { service, userRepo } = setup([user]);
    await expect(service.loginWithPassword(user.email, "falsch")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect((await userRepo.findById("u1"))?.failedLoginCount).toBe(1);
  });

  it("sperrt das Konto nach 5 Fehlversuchen (LOCKED)", async () => {
    const { service } = setup([user]);
    for (let i = 0; i < 5; i++) {
      await expect(service.loginWithPassword(user.email, "falsch")).rejects.toBeInstanceOf(AuthError);
    }
    // 6. Versuch — jetzt sogar mit richtigem Passwort gesperrt
    await expect(service.loginWithPassword(user.email, "geheim123")).rejects.toMatchObject({
      code: "LOCKED",
    });
  });

  it("bei aktiviertem 2FA ist die Session bis zur TOTP-Bestätigung pending", async () => {
    const secret = totp.generateSecret();
    const u = await makeUser({ totpSecret: secret, totpEnabled: true });
    const { service } = setup([u]);

    const res = await service.loginWithPassword(u.email, "geheim123");
    expect(res.needsTotp).toBe(true);
    expect(await service.resolveSession(res.token)).toBeNull(); // pending → kein Zugriff

    await service.verifyTotp(res.token, totpCode(secret));
    expect(await service.resolveSession(res.token)).toMatchObject({ id: "u1" });
  });

  it("falscher TOTP-Code wirft INVALID_TOTP", async () => {
    const secret = totp.generateSecret();
    const u = await makeUser({ totpSecret: secret, totpEnabled: true });
    const { service } = setup([u]);
    const res = await service.loginWithPassword(u.email, "geheim123");
    await expect(service.verifyTotp(res.token, "000000")).rejects.toMatchObject({ code: "INVALID_TOTP" });
  });

  it("setupTotp + enableTotp aktiviert 2FA", async () => {
    const { service, userRepo } = setup([user]);
    const { secret } = await service.setupTotp("u1");
    await service.enableTotp("u1", totpCode(secret));
    expect((await userRepo.findById("u1"))?.totpEnabled).toBe(true);
  });

  it("logout invalidiert die Session", async () => {
    const { service } = setup([user]);
    const res = await service.loginWithPassword(user.email, "geheim123");
    await service.logout(res.token);
    expect(await service.resolveSession(res.token)).toBeNull();
  });

  it("inaktiver Nutzer kann sich nicht anmelden", async () => {
    const u = await makeUser({ active: false });
    const { service } = setup([u]);
    await expect(service.loginWithPassword(u.email, "geheim123")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });
});

describe("AuthService — Benutzerverwaltung (@texma-gmbh.de)", () => {
  it("legt ein Konto an und es kann sich einloggen", async () => {
    const { service } = setup([]);
    const res = await service.createUser({ email: "Anna@texma-gmbh.de", name: "Anna", role: "BUERO", password: "geheim12" });
    expect(res.id).toBeTruthy();
    const list = await service.listUsers();
    expect(list[0]).toMatchObject({ email: "anna@texma-gmbh.de", role: "BUERO", active: true, totpEnabled: false });
    const login = await service.loginWithPassword("anna@texma-gmbh.de", "geheim12");
    expect(login.needsTotp).toBe(false);
  });

  it("erzwingt die TEXMA-Domain und Mindestpasswortlänge, verhindert Duplikate", async () => {
    const { service } = setup([]);
    await expect(service.createUser({ email: "x@gmail.com", name: "X", role: "BUERO", password: "geheim12" })).rejects.toThrow(/texma-gmbh\.de/);
    await expect(service.createUser({ email: "y@texma-gmbh.de", name: "Y", role: "BUERO", password: "kurz" })).rejects.toThrow(/8 Zeichen/);
    await service.createUser({ email: "z@texma-gmbh.de", name: "Z", role: "BUERO", password: "geheim12" });
    await expect(service.createUser({ email: "z@texma-gmbh.de", name: "Z2", role: "BUERO", password: "geheim12" })).rejects.toThrow(/vergeben/);
  });

  it("2FA-Einrichtung: setupTotp → enableTotp macht needsTotp beim Login true", async () => {
    const { service, userRepo } = setup([]);
    const { id } = await service.createUser({ email: "tf@texma-gmbh.de", name: "TF", role: "ADMIN", password: "geheim12" });
    const { secret } = await service.setupTotp(id);
    const { Secret, TOTP } = await import("otpauth");
    const code = new TOTP({ issuer: "TEXMA ERP", secret: Secret.fromBase32(secret) }).generate();
    await service.enableTotp(id, code);
    const u = await userRepo.findById(id);
    expect(u?.totpEnabled).toBe(true);
    const login = await service.loginWithPassword("tf@texma-gmbh.de", "geheim12");
    expect(login.needsTotp).toBe(true);
  });

  it("Konto deaktivieren verhindert den Login", async () => {
    const { service, userRepo } = setup([]);
    const { id } = await service.createUser({ email: "d@texma-gmbh.de", name: "D", role: "BUERO", password: "geheim12" });
    await service.setUserActive(id, false);
    expect((await userRepo.findById(id))?.active).toBe(false);
  });
});

describe("AuthService — Konto-Selbstverwaltung", () => {
  function setupSelf(users: UserRecord[]) {
    const userRepo = new InMemoryUserRepository(users);
    const sessionRepo = new InMemorySessionRepository();
    const audit = new MemoryAuditSink();
    const resetRepo = new InMemoryPasswordResetRepository();
    const sent: { email: string; link: string }[] = [];
    const service = new AuthService(userRepo, sessionRepo, audit, hasher, totp, () => new Date(), {
      repo: resetRepo,
      mailer: { sendResetLink: async (email, link) => void sent.push({ email, link }) },
      baseUrl: "https://erp.texma-gmbh.de",
    });
    return { service, userRepo, sent };
  }

  it("updateProfile ändert den eigenen Namen", async () => {
    const { service, userRepo } = setupSelf([await makeUser()]);
    await service.updateProfile("u1", "Neuer Name");
    expect((await userRepo.findById("u1"))?.name).toBe("Neuer Name");
    await expect(service.updateProfile("u1", "  ")).rejects.toThrow(/Pflicht/);
  });

  it("changePassword prüft das alte Passwort und setzt das neue", async () => {
    const { service } = setupSelf([await makeUser()]);
    await expect(service.changePassword("u1", "falsch", "neuesPW12")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await service.changePassword("u1", "geheim123", "neuesPW12");
    const login = await service.loginWithPassword("büro@texma.de", "neuesPW12");
    expect(login.token).toBeTruthy();
    await expect(service.changePassword("u1", "neuesPW12", "kurz")).rejects.toThrow(/8 Zeichen/);
  });

  it("Passwort vergessen → Reset-Link → Passwort neu setzen", async () => {
    const { service, sent } = setupSelf([await makeUser()]);
    await service.requestPasswordReset("BÜRO@texma.de");
    expect(sent).toHaveLength(1);
    const token = new URL(sent[0]!.link.replace("/#reset?", "/reset?")).searchParams.get("token")!;
    expect(token).toBeTruthy();
    await service.resetPassword(token, "ganzNeu123");
    const login = await service.loginWithPassword("büro@texma.de", "ganzNeu123");
    expect(login.token).toBeTruthy();
    // Token ist verbraucht → zweiter Versuch scheitert
    await expect(service.resetPassword(token, "nochmal123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("Passwort vergessen für unbekannte Adresse meldet keinen Fehler (Enumeration-Schutz)", async () => {
    const { service, sent } = setupSelf([await makeUser()]);
    await expect(service.requestPasswordReset("niemand@texma.de")).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});
