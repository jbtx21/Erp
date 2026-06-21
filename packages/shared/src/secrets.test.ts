import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AesGcmSecretsProvider,
  KeyVaultSecretsProvider,
  createSecretsProvider,
  type KeyVaultClient,
} from "./secrets.js";

const key = randomBytes(32);

describe("AesGcmSecretsProvider — Dev-/at-rest-Fallback", () => {
  it("seal/resolve ist ein Round-Trip", async () => {
    const p = new AesGcmSecretsProvider(key);
    const ref = await p.seal("cs_live_supersecret");
    expect(ref).not.toContain("cs_live_supersecret"); // Klartext nicht in der Referenz
    expect(await p.resolve(ref)).toBe("cs_live_supersecret");
  });

  it("resolve wirft bei Manipulation/falschem Key", async () => {
    const ref = await new AesGcmSecretsProvider(key).seal("geheim");
    await expect(new AesGcmSecretsProvider(randomBytes(32)).resolve(ref)).rejects.toThrow();
  });

  it("fromEnv liest SECRETS_KEY und validiert die Länge", async () => {
    const p = AesGcmSecretsProvider.fromEnv({ SECRETS_KEY: key.toString("base64") });
    expect(await p.resolve(await p.seal("x"))).toBe("x");
    expect(() => AesGcmSecretsProvider.fromEnv({})).toThrow(/SECRETS_KEY fehlt/);
  });
});

/** In-Memory-Fake des Vault-Clients — beweist den Provider ohne Azure-SDK/Netzwerk. */
function fakeVault(): KeyVaultClient & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async getSecret(name) {
      const v = store.get(name);
      if (v === undefined) throw new Error(`Secret ${name} nicht im Vault.`);
      return v;
    },
    async setSecret(name, value) {
      store.set(name, value);
      return name;
    },
  };
}

describe("KeyVaultSecretsProvider — Prod (gegen Fake-Client)", () => {
  it("seal legt im Vault ab; die Referenz ist der Name, nicht der Klartext", async () => {
    const vault = fakeVault();
    const p = new KeyVaultSecretsProvider(vault, () => "texma-fixed-name");
    const ref = await p.seal("token-123");
    expect(ref).toBe("texma-fixed-name");
    expect(vault.store.get("texma-fixed-name")).toBe("token-123"); // Wert nur im Vault
    expect(await p.resolve(ref)).toBe("token-123");
  });

  it("seal erzeugt je Aufruf eindeutige Namen (Default-Factory)", async () => {
    const p = new KeyVaultSecretsProvider(fakeVault());
    const a = await p.seal("a");
    const b = await p.seal("b");
    expect(a).not.toBe(b);
  });

  it("resolve wirft bei unbekannter Referenz", async () => {
    await expect(new KeyVaultSecretsProvider(fakeVault()).resolve("fehlt")).rejects.toThrow();
  });
});

describe("createSecretsProvider — Backend-Auswahl per Umgebung", () => {
  const env = { SECRETS_KEY: key.toString("base64") } as NodeJS.ProcessEnv;

  it("ohne SECRETS_BACKEND → AES-GCM-Fallback", () => {
    expect(createSecretsProvider({ env })).toBeInstanceOf(AesGcmSecretsProvider);
  });

  it("azure-keyvault mit injiziertem Client → Key-Vault-Provider", () => {
    const p = createSecretsProvider({ env: { ...env, SECRETS_BACKEND: "azure-keyvault" }, keyVaultClient: fakeVault() });
    expect(p).toBeInstanceOf(KeyVaultSecretsProvider);
  });

  it("azure-keyvault ohne Client → Fehler (kein stiller Fallback)", () => {
    expect(() => createSecretsProvider({ env: { ...env, SECRETS_BACKEND: "azure-keyvault" } })).toThrow(/KeyVaultClient/);
  });
});
