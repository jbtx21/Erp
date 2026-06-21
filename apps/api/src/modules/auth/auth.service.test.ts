import { Secret, TOTP } from "otpauth";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import {
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
