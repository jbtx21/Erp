// Secrets-Manager-Port (Leitplanke 2: Sicherheit nicht selbst bauen; ADR 0002).
//
// Bislang werden ruhende Zugangsdaten (z. B. WooCommerce consumer secret) mit einem
// app-eigenen AES-256-GCM-Master-Key (SECRETS_KEY) ver-/entschlüsselt — siehe crypto.ts.
// Das ist „Secret Zero": Wer den Master-Key hat, hat alle Secrets, und der Key liegt in
// der Umgebung. Zielbild (TEXMA-Stack): Azure Key Vault per Managed Identity — kein
// Master-Key mehr im Betrieb, Rotation/Audit beim Anbieter.
//
// Dieser Port entkoppelt die Anwendung von der konkreten Quelle:
//   - `resolve(ref)`  löst eine gespeicherte Referenz in den Klartext auf,
//   - `seal(plain)`   versiegelt einen Klartext in eine speicherbare Referenz.
// Die DB hält nur die (undurchsichtige) Referenz. Beim AES-Fallback IST die Referenz das
// verschlüsselte Token; beim Key Vault ist sie der Secret-Name. Aufrufer kennen den
// Unterschied nicht — austauschbar wie der OIDC-Verifier (ADR 0001).

import { decryptSecret, encryptSecret, loadSecretsKey } from "./crypto.js";

/** Undurchsichtige, speicherbare Referenz auf ein Secret (Token oder Vault-Name). */
export type SecretRef = string;

export interface SecretsProvider {
  /** Löst eine Referenz in den Klartext auf. Wirft, wenn unauffindbar/manipuliert. */
  resolve(ref: SecretRef): Promise<string>;
  /** Versiegelt einen Klartext in eine speicherbare Referenz. */
  seal(plain: string): Promise<SecretRef>;
}

/**
 * Dev-/Fallback-Provider: at-rest-Verschlüsselung mit AES-256-GCM (crypto.ts). Die
 * Referenz ist das selbsttragende Token "v1:<iv>:<tag>:<ct>" — kein externer Aufruf.
 * Nur für lokale Entwicklung/Tests gedacht; in Produktion gilt der Key Vault (ADR 0002).
 */
export class AesGcmSecretsProvider implements SecretsProvider {
  constructor(private readonly key: Buffer) {}

  async resolve(ref: SecretRef): Promise<string> {
    return decryptSecret(ref, this.key);
  }

  async seal(plain: string): Promise<SecretRef> {
    return encryptSecret(plain, this.key);
  }

  /** Baut den Provider aus SECRETS_KEY (base64, 32 Byte). Wirft bei Fehlen/falscher Länge. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AesGcmSecretsProvider {
    return new AesGcmSecretsProvider(loadSecretsKey(env));
  }
}

/**
 * Minimaler Vertrag eines Key-Vault-Clients — genau die zwei Operationen, die der Port
 * braucht. So bleibt der Provider ohne harte SDK-Abhängigkeit voll testbar (Fake-Client),
 * und der echte `@azure/keyvault-secrets`-Client wird erst in `fromEnv` lazy verdrahtet.
 */
export interface KeyVaultClient {
  /** Liefert den aktuellen Wert eines Secrets (oder wirft, wenn nicht vorhanden). */
  getSecret(name: string): Promise<string>;
  /** Legt einen neuen Secret-Wert an/aktualisiert ihn; liefert den Secret-Namen zurück. */
  setSecret(name: string, value: string): Promise<string>;
}

/** Erzeugt für `seal` deterministisch eindeutige, vault-taugliche Secret-Namen. */
export type SecretNameFactory = () => string;

const defaultNameFactory: SecretNameFactory = () =>
  `texma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Produktions-Provider: speichert/liest Secrets im Azure Key Vault. Die Referenz ist der
 * Secret-Name; der Klartext verlässt den Vault nur on demand und liegt nie in der TEXMA-DB.
 * Authentifizierung läuft im Client (Managed Identity) — hier bewusst nicht sichtbar.
 */
export class KeyVaultSecretsProvider implements SecretsProvider {
  constructor(
    private readonly client: KeyVaultClient,
    private readonly nameFactory: SecretNameFactory = defaultNameFactory,
  ) {}

  async resolve(ref: SecretRef): Promise<string> {
    return this.client.getSecret(ref);
  }

  async seal(plain: string): Promise<SecretRef> {
    const name = this.nameFactory();
    return this.client.setSecret(name, plain);
  }
}

/**
 * Wählt den Provider anhand der Umgebung:
 *   - SECRETS_BACKEND=azure-keyvault → Key Vault (Adapter wird vom Aufrufer injiziert,
 *     da der echte SDK-Client Netzwerk/Managed Identity braucht; siehe ADR 0002 #1),
 *   - sonst                         → AES-GCM-Fallback (Dev/Test).
 *
 * Der Key-Vault-Zweig erwartet einen vorab gebauten `KeyVaultClient`, damit dieses Paket
 * frei von Azure-SDK-Abhängigkeiten und voll offline testbar bleibt.
 */
export function createSecretsProvider(
  opts: { keyVaultClient?: KeyVaultClient; env?: NodeJS.ProcessEnv } = {},
): SecretsProvider {
  const env = opts.env ?? process.env;
  if (env.SECRETS_BACKEND === "azure-keyvault") {
    if (!opts.keyVaultClient) {
      throw new Error(
        "SECRETS_BACKEND=azure-keyvault gesetzt, aber kein KeyVaultClient injiziert (ADR 0002).",
      );
    }
    return new KeyVaultSecretsProvider(opts.keyVaultClient);
  }
  return AesGcmSecretsProvider.fromEnv(env);
}
