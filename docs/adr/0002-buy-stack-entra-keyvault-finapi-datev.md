# ADR 0002 — Buy-Stack: Entra ID · Azure Key Vault · finAPI · DATEV/EN-16931

- **Status:** akzeptiert (TEXMA / Projektleitung)
- **Kontext-Leitplanken:** `docs/make-or-buy-leitplanken.md` (Leitplanke 1 „nur Differenzierendes
  selbst bauen", Leitplanke 2 „Sicherheit nicht selbst bauen")
- **Folgt auf:** ADR 0001 (Auth-Externalisierung via OIDC)

## Kontext

Die differenzierenden Module (Stickerei A7, mehrstufige Fremdvergabe A2, Nachkalkulation A6,
Termin/Ampel A8) sind bewusst Eigenbau — sie sind der Wettbewerbsvorteil und haben kein
Standard-ERP-Pendant. Der **Standard-Block** (Identität, Secrets, Banking, FiBu/Mahnwesen,
E-Rechnung) ist reguliertes Commodity (GoBD, PSD2, SEPA, EN 16931) ohne Differenzierungswert
und mit dauerhafter Compliance-Last. TEXMA betreibt Microsoft 365/Azure.

## Entscheidung

Der Standard-Block wird **eingekauft/integriert**, kohärent im Microsoft-Stack:

| Schicht | Wahl | Begründung |
|---|---|---|
| **Identität** | Microsoft Entra ID (OIDC) | Verzeichnis existiert bereits (M365); MFA/Conditional Access gehärtet durch Microsoft; EU-Residenz; keine Zusatzlizenz für interne ERP-Nutzer. App Roles → Rollen-Claim. |
| **Secrets** | Azure Key Vault | Gleiche Tenant-/IAM-Welt; **Managed Identity** beseitigt das „Secret-Zero"-Problem von `crypto.ts`/`SECRETS_KEY`; Rotation/Audit eingebaut. |
| **Banking** | finAPI (PSD2 AIS/PIS) | BaFin-lizenziert, DE-Hosting (GoBD/DSGVO); AIS speist den Zahlungsabgleich, PIS die SEPA-Ausgänge; kapselt FinTS/HBCI-Wildwuchs. Hinter `BankingProvider`-Port. |
| **FiBu/E-Rechnung** | DATEV-Anbindung + EN-16931-Lib | Steuerberater-Welt ist DATEV; EN 16931 (XRechnung/ZUGFeRD) nie selbst pflegen. |

## Konfiguration (Zielbild)

| ENV | Wert (Beispiel) |
|---|---|
| `OIDC_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| `OIDC_AUDIENCE` | App-(Client-)ID der ERP-Registrierung |
| `OIDC_JWKS_URI` | `https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys` |
| `OIDC_ROLE_CLAIM` | `roles` (Entra App Roles) |
| `SECRETS_BACKEND` | `azure-keyvault` (Prod) · leer/sonst → AES-GCM-Fallback (Dev) |
| `AZURE_KEYVAULT_URL` | `https://<vault-name>.vault.azure.net` (nur bei `azure-keyvault`) |
| Secrets-Auth | via Managed Identity (DefaultAzureCredential) — kein `SECRETS_KEY` in Prod |

> Optionale Laufzeit-Abhängigkeiten für den Key-Vault-Zweig (erst bei Aktivierung
> installieren): `@azure/identity`, `@azure/keyvault-secrets`. Werden lazy importiert,
> damit Build/Tests ohne Azure-SDK laufen.

## Konsequenzen

- **+** Identität, Secrets und Banking liegen bei gehärteten, regulierten Anbietern; Eigenbetrieb
  sinkt; Eigenbau bleibt auf die vier Differenzierer begrenzt.
- **+** Der bereits eingebaute generische OIDC-Verifier (`jose`, ADR 0001) ist Entra-kompatibel —
  nur Konfiguration, kein neuer Code für die Identität.
- **−** Der eingefrorene C1-Eigenbau (Banking/Mahnwesen/E-Rechnung/3-Way-Match) wird mittelfristig
  durch Integrationen ersetzt; er bleibt nur Interim hinter Ports (Sunk Cost zählt nicht, Leitplanke 3).
- **Abhängigkeit:** Secrets-Manager und IdP folgen der Plattform — bei Plattformwechsel zu ändern.

## Offene Punkte (Folge-ADRs/Tasks)

1. **`SecretsProvider`-Port** (analog OIDC-Port) — **erledigt** in `packages/shared/src/secrets.ts`:
   `SecretsProvider` (seal/resolve), `AesGcmSecretsProvider` (Dev-Fallback über crypto.ts),
   `KeyVaultSecretsProvider` (Prod, gegen injizierten `KeyVaultClient` testbar),
   `createAzureKeyVaultClient` (lazy Managed-Identity-Adapter) sowie `createSecretsProvider`
   (synchron, Injektion) und `secretsProviderFromEnv` (asynchron, baut den Vault-Client selbst).
   Die drei Consumer — `runtime.ts`, Woo- und Supplier-Runner — sind von
   `decryptSecret`/`loadSecretsKey` auf den Port umgestellt. Tests in `secrets.test.ts`.
2. **`BankingProvider`-Port + finAPI-Connector** im bestehenden `services/workers/connectors/*`-Muster.
3. **finAPI-Kontotyp klären** — PSD2 (SCA-Reconsent ~90 Tage) vs. EBICS/Corporate (unbeaufsichtigt).
4. **DATEV-/EN-16931-Integration** terminieren; Cookie-Session-Pfad nach Entra-Anbindung zurückbauen.
