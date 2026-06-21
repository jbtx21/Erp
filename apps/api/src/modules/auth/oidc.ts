// OIDC-Identitätsprüfung (Sicherheits-Maxime, Leitplanke 2: Auth/Identity nicht selbst
// bauen). Statt eigene Sessions auszustellen, konsumiert die App von einem etablierten
// Identity-Provider ausgestellte JWT-Access-Tokens und verifiziert sie mit der geprüften
// Bibliothek `jose` (Signatur über JWKS, Issuer/Audience, Ablauf). Die fachliche RBAC
// bindet an die verifizierten Claims (sub/email/role). Die Rollenliste bleibt im Code,
// die Identitätsausgabe nicht.

import {
  createRemoteJWKSet,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTPayload,
  type JWTVerifyGetKey,
  type KeyObject,
} from "jose";
import type { Role } from "@texma/shared";
import type { AuthUser } from "./auth.service.js";

const ROLES: readonly Role[] = ["ADMIN", "BUERO", "PRODUKTION", "BUCHHALTUNG"];

export class OidcVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcVerificationError";
  }
}

/** Prüft ein Provider-Token und liefert den authentifizierten Nutzer (oder wirft). */
export interface IdentityVerifier {
  verify(token: string): Promise<AuthUser>;
}

/** Schlüsselauflösung, wie sie `jose.jwtVerify` akzeptiert (Remote-JWKS oder Schlüssel). */
type KeyResolver = JWTVerifyGetKey | CryptoKey | KeyObject | JWK | Uint8Array;

/**
 * Rein/testbar: bildet verifizierte JWT-Claims auf einen AuthUser ab. Die Rolle muss als
 * gültiger Claim vorliegen (kein Default — fehlende/unbekannte Rolle ist ein Fehler).
 * 2FA wird beim IdP erzwungen; `totpEnabled` spiegelt die Auth-Method-Reference (amr).
 */
export function claimsToAuthUser(claims: JWTPayload, roleClaim: string): AuthUser {
  const sub = claims.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new OidcVerificationError("Token ohne gültigen 'sub'-Claim.");
  }
  const roleRaw = (claims as Record<string, unknown>)[roleClaim];
  if (typeof roleRaw !== "string" || !ROLES.includes(roleRaw as Role)) {
    throw new OidcVerificationError(`Ungültige oder fehlende Rolle im Claim '${roleClaim}'.`);
  }
  const email = typeof claims.email === "string" ? claims.email : "";
  const name = typeof (claims as Record<string, unknown>).name === "string"
    ? ((claims as Record<string, unknown>).name as string)
    : email || sub;
  const amr = (claims as Record<string, unknown>).amr;
  const mfa = Array.isArray(amr) && amr.some((m) => m === "mfa" || m === "otp" || m === "totp");
  return { id: sub, email, name, role: roleRaw as Role, totpEnabled: mfa };
}

export interface JoseOidcConfig {
  issuer: string;
  audience: string;
  /** Claim, der die TEXMA-Rolle trägt (Provider-Mapping). Default "role". */
  roleClaim?: string;
  /** Schlüsselauflösung: in Prod ein Remote-JWKS, in Tests ein injizierter Schlüssel. */
  keyResolver: KeyResolver;
}

export class JoseOidcVerifier implements IdentityVerifier {
  constructor(private readonly cfg: JoseOidcConfig) {}

  async verify(token: string): Promise<AuthUser> {
    const options = { issuer: this.cfg.issuer, audience: this.cfg.audience };
    let payload: JWTPayload;
    try {
      // `jose` prüft Signatur, Issuer, Audience und Ablauf. Getter (JWKS) vs. fester
      // Schlüssel treffen unterschiedliche Overloads — daher die Fallunterscheidung.
      const key = this.cfg.keyResolver;
      ({ payload } =
        typeof key === "function"
          ? await jwtVerify(token, key, options)
          : await jwtVerify(token, key, options));
    } catch {
      throw new OidcVerificationError("Token-Verifikation fehlgeschlagen.");
    }
    return claimsToAuthUser(payload, this.cfg.roleClaim ?? "role");
  }

  /** Baut den Verifier aus der Umgebung; ohne vollständige OIDC-Konfiguration null. */
  static fromEnv(): JoseOidcVerifier | null {
    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_AUDIENCE;
    const jwksUri = process.env.OIDC_JWKS_URI;
    if (!issuer || !audience || !jwksUri) return null;
    return new JoseOidcVerifier({
      issuer,
      audience,
      roleClaim: process.env.OIDC_ROLE_CLAIM ?? "role",
      keyResolver: createRemoteJWKSet(new URL(jwksUri)),
    });
  }
}
