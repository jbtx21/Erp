// Session-Token: zufälliger Klartext (nur im httpOnly-Cookie) + SHA-256-Hash (in der DB).
import { createHash, randomBytes } from "node:crypto";

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
