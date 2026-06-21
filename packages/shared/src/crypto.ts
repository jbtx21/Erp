// App-seitige Secret-Verschlüsselung (AES-256-GCM) für ruhende Zugangsdaten
// (z. B. WooCommerce consumer secret). DSGVO/Kap. 28: Secrets nie im Klartext at-rest.
// Master-Key kommt aus der Umgebung (SECRETS_KEY, base64, 32 Byte) — kein Vault nötig.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM-Standard
const VERSION = "v1";

/** Lädt den 32-Byte-Master-Key aus SECRETS_KEY (base64). Wirft bei Fehlen/falscher Länge. */
export function loadSecretsKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.SECRETS_KEY;
  if (!raw) {
    throw new Error("SECRETS_KEY fehlt (base64-kodierter 32-Byte-Schlüssel erwartet).");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`SECRETS_KEY muss 32 Byte sein (ist ${key.length}).`);
  }
  return key;
}

/** Verschlüsselt Klartext → Token "v1:<ivB64>:<tagB64>:<ctB64>". */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/** Entschlüsselt ein Token aus encryptSecret. Wirft bei Manipulation (Auth-Tag) oder falschem Key. */
export function decryptSecret(token: string, key: Buffer): string {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Ungültiges Secret-Token-Format.");
  }
  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
