import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, loadSecretsKey } from "./crypto.js";

const key = randomBytes(32);

describe("crypto — AES-256-GCM Secret-Verschlüsselung", () => {
  it("roundtrip: entschlüsselt den ursprünglichen Klartext", () => {
    const token = encryptSecret("cs_live_supersecret", key);
    expect(token.startsWith("v1:")).toBe(true);
    expect(decryptSecret(token, key)).toBe("cs_live_supersecret");
  });

  it("erzeugt je Aufruf andere Chiffretexte (zufälliger IV)", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });

  it("schlägt mit falschem Schlüssel fehl", () => {
    const token = encryptSecret("geheim", key);
    expect(() => decryptSecret(token, randomBytes(32))).toThrow();
  });

  it("erkennt manipulierten Chiffretext über den Auth-Tag", () => {
    const token = encryptSecret("geheim", key);
    const parts = token.split(":");
    const ct = Buffer.from(parts[3]!, "base64");
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("loadSecretsKey validiert Vorhandensein und Länge", () => {
    expect(() => loadSecretsKey({})).toThrow(/SECRETS_KEY fehlt/);
    expect(() => loadSecretsKey({ SECRETS_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 Byte/);
    const ok = loadSecretsKey({ SECRETS_KEY: key.toString("base64") });
    expect(ok.length).toBe(32);
  });
});
