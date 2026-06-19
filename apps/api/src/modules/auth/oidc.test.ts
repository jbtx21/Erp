// OIDC-Identitätsprüfung (Leitplanke 2). Claim-Mapping rein getestet; Verifikation
// per `jose` mit einem im Test erzeugten RSA-Schlüsselpaar (kein Netz/kein echter IdP).

import { describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { JoseOidcVerifier, OidcVerificationError, claimsToAuthUser } from "./oidc.js";

const ISSUER = "https://id.texma.example/";
const AUDIENCE = "texma-erp";

describe("claimsToAuthUser", () => {
  it("bildet gültige Claims auf einen AuthUser ab", () => {
    const u = claimsToAuthUser({ sub: "u-1", email: "a@texma.de", name: "Alice", role: "BUERO" }, "role");
    expect(u).toMatchObject({ id: "u-1", email: "a@texma.de", name: "Alice", role: "BUERO" });
  });

  it("setzt totpEnabled aus der Auth-Method-Reference (amr)", () => {
    const u = claimsToAuthUser({ sub: "u-1", role: "ADMIN", amr: ["pwd", "mfa"] }, "role");
    expect(u.totpEnabled).toBe(true);
  });

  it("wirft bei fehlender/ungültiger Rolle", () => {
    expect(() => claimsToAuthUser({ sub: "u-1" }, "role")).toThrow(OidcVerificationError);
    expect(() => claimsToAuthUser({ sub: "u-1", role: "HACKER" }, "role")).toThrow(OidcVerificationError);
  });

  it("wirft ohne sub", () => {
    expect(() => claimsToAuthUser({ role: "ADMIN" }, "role")).toThrow(OidcVerificationError);
  });

  it("liest die Rolle aus einem konfigurierbaren Claim", () => {
    const u = claimsToAuthUser({ sub: "u-1", "texma/role": "BUCHHALTUNG" }, "texma/role");
    expect(u.role).toBe("BUCHHALTUNG");
  });
});

describe("JoseOidcVerifier (jose, RS256)", () => {
  async function sign(claims: Record<string, unknown>, opts?: { audience?: string }) {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwt = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(opts?.audience ?? AUDIENCE)
      .setExpirationTime("5m")
      .sign(privateKey);
    return { jwt, publicKey };
  }

  it("verifiziert ein gültiges Token und liefert den Nutzer", async () => {
    const { jwt, publicKey } = await sign({ sub: "u-9", email: "p@texma.de", role: "PRODUKTION" });
    const verifier = new JoseOidcVerifier({ issuer: ISSUER, audience: AUDIENCE, keyResolver: publicKey });
    const user = await verifier.verify(jwt);
    expect(user).toMatchObject({ id: "u-9", role: "PRODUKTION" });
  });

  it("lehnt ein Token mit falscher Audience ab", async () => {
    const { jwt, publicKey } = await sign({ sub: "u-9", role: "ADMIN" }, { audience: "anderes-system" });
    const verifier = new JoseOidcVerifier({ issuer: ISSUER, audience: AUDIENCE, keyResolver: publicKey });
    await expect(verifier.verify(jwt)).rejects.toBeInstanceOf(OidcVerificationError);
  });

  it("lehnt ein Token mit ungültiger Rolle ab (nach gültiger Signatur)", async () => {
    const { jwt, publicKey } = await sign({ sub: "u-9", role: "KEINE_ROLLE" });
    const verifier = new JoseOidcVerifier({ issuer: ISSUER, audience: AUDIENCE, keyResolver: publicKey });
    await expect(verifier.verify(jwt)).rejects.toBeInstanceOf(OidcVerificationError);
  });
});
