// TOTP-2FA (RFC 6238) über otpauth. Secret wird als base32 gespeichert.
import { Secret, TOTP } from "otpauth";

const ISSUER = "TEXMA ERP";

export interface TotpService {
  generateSecret(): string;
  keyUri(email: string, secret: string): string;
  verify(code: string, secret: string): boolean;
}

export class OtpauthTotpService implements TotpService {
  generateSecret(): string {
    return new Secret({ size: 20 }).base32;
  }

  keyUri(email: string, secret: string): string {
    return this.totp(email, secret).toString();
  }

  verify(code: string, secret: string): boolean {
    // validate() liefert das Zeitfenster-Delta (0 = aktuell) oder null bei Fehlschlag.
    return this.totp("", secret).validate({ token: code, window: 1 }) !== null;
  }

  private totp(email: string, secret: string): TOTP {
    return new TOTP({ issuer: ISSUER, label: email, secret: Secret.fromBase32(secret) });
  }
}
