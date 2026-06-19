# ADR 0001 — Auth/Identity externalisieren (OIDC), Sicherheit als Maxime

- **Status:** akzeptiert
- **Kontext-Leitplanke:** `docs/make-or-buy-leitplanken.md`, Leitplanke 2
- **Entscheidung TEXMA:** „Höchster Sicherheitsstandard ist Maxime."

## Kontext

Die sicherheitskritische Querschnittsschicht (Identität, Session, 2FA, Passwort-Hashing,
RBAC-Durchsetzung) wurde im Greenfield zunächst selbst gebaut (`auth.service.ts` mit
eigener Session-Ausgabe/-Lockout, `crypto.ts` als AES-256-GCM-Tresor, `rbac.ts`). Selbst
gebaute Auth/Krypto ist die gefährlichste Angriffsfläche: sie härtet sich nicht selbst nach
und wächst mit der Codebasis. Passwort-Hashing (`@node-rs/argon2`) und TOTP (`otpauth`)
nutzen bereits geprüfte Bibliotheken; Session-Ausgabe, Credential-Tresor und RBAC-Bindung
waren jedoch Eigenbau.

## Entscheidung

1. **Identität über OIDC.** Die App stellt keine eigenen Sessions mehr aus, sondern
   verifiziert vom Identity-Provider ausgestellte **JWT-Access-Tokens** mit der geprüften
   Bibliothek **`jose`** (Signatur via JWKS, Issuer, Audience, Ablauf). Implementierung:
   `apps/api/src/modules/auth/oidc.ts` (`IdentityVerifier`-Port, `JoseOidcVerifier`,
   reine `claimsToAuthUser`-Abbildung).
2. **RBAC bleibt Fachlogik, Identität nicht.** Die Rollenliste und die fachliche Redaktion
   (z. B. „PRODUKTION sieht keine Preise") bleiben im Code, binden aber an die verifizierten
   Token-Claims (`sub`, `email`, `role`-Claim konfigurierbar; 2FA über `amr`).
3. **Server-Wiring.** `buildServer` bevorzugt den OIDC-Bearer-Pfad (`Authorization: Bearer`),
   sofern via `OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_JWKS_URI` konfiguriert. Der selbstgebaute
   Cookie-Session-Pfad bleibt nur als **Übergangs-Fallback** (Dev) erhalten und gilt als
   **deprecated**.
4. **Credential-Tresor.** `crypto.ts` (AES-GCM) wird mittelfristig durch den Secrets-Manager
   der Plattform/des Providers abgelöst (Folge-ADR). Bis dahin bleibt er als Dev-Fallback.

## Konfiguration (Prod)

| ENV | Zweck |
|---|---|
| `OIDC_ISSUER` | erwarteter Token-Issuer (z. B. `https://id.example/`) |
| `OIDC_AUDIENCE` | erwartete Audience (diese App) |
| `OIDC_JWKS_URI` | JWKS-Endpunkt des Providers (Schlüsselrotation automatisch via `jose`) |
| `OIDC_ROLE_CLAIM` | Claim mit der TEXMA-Rolle (Default `role`) |

Fehlt die Konfiguration, ist der OIDC-Pfad inaktiv (Fallback auf Cookie-Session).

## Konsequenzen

- **+** Standardprotokoll + geprüfte Bibliothek statt selbst komponierter Session/Krypto;
  Schlüsselrotation, 2FA-Policy und Lockout liegen beim gehärteten Provider.
- **+** Gilt unabhängig vom Make-or-Buy-Ausgang (Leitplanke 2).
- **−** Der vorhandene Session-/2FA-Eigenbau wird mittelfristig zurückgebaut (teils „verloren"
  bei Buy — bewusst akzeptiert: Sicherheit ist Maxime, Sunk Cost zählt nicht, Leitplanke 3).
- **Offen (Folge-ADR):** Auswahl des konkreten Providers; Ablösung von `crypto.ts` durch einen
  Secrets-Manager; vollständiger Rückbau des Cookie-Session-Pfads nach Provider-Anbindung.

## Test-/Nachweis

- `oidc.test.ts`: reine Claim-Abbildung + `jose`-Round-Trip mit im Test erzeugtem RSA-Schlüssel
  (gültig → Nutzer; falsche Audience → Fehler; ungültige Rolle → Fehler). Kein echter IdP nötig.
- `server.test.ts`: `buildServer({ identityVerifier })` löst `auth.me` aus einem Bearer-Token
  auf; ohne Token bleibt der geschützte Endpunkt `UNAUTHORIZED`.
