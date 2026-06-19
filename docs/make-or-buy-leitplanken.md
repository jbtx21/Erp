# Make-or-Buy-Leitplanken (verbindlich)

> Status: **verbindlich** ab Review-Datum. Quelle: Make-or-Buy-Review zum TEXMA-ERP.
> Bezug: Lastenheft Kap. 24.2 (Bus-Faktor), Kap. 30/31.1 (Buy-Kandidaten Xentral/reybex/
> orgaMAX), `docs/xentral-alignment.md` (Greenfield als Referenz-Benchmark).

## Ausgangslage

Der Greenfield-Eigenbau läuft **bewusst parallel** zu einem Buy-Auswahlverfahren
(Demo-/Usability-Tests am echten TEXMA-Fall). Die Make-or-Buy-Entscheidung ist **offen**.
Daraus folgen drei verbindliche Leitplanken für die Priorisierung bis zur Entscheidung.

---

## Leitplanke 1 — Fokus-Schnitt: differenzierend zuerst, Standard-Block zurückstellen

**Vorrang** auf die Module, die ein Standard-ERP NICHT von der Stange kann und die den
Vergleichswert gegen die Buy-Demos bilden:

| Modul | Code | Stand |
|---|---|---|
| Mehrstufige Fremdvergabe (A2) | `packages/shared/src/subproduction.ts`, `apps/api/.../subproduction` | ✅ gebaut — Tiefe ausbauen erlaubt |
| Stickerei-Partnerlogik (A7) | `packages/shared/src/stickerei.ts`, `apps/api/.../stickerei` | ✅ gebaut — Tiefe ausbauen erlaubt |
| Termin/Ampel (A8) | `packages/shared/src/ampel.ts`, `apps/api/.../ampel` | ✅ gebaut — Tiefe ausbauen erlaubt |
| Nachkalkulation (A6) | `packages/shared/src/postcalc.ts`, `apps/api/.../postcalc` | ✅ gebaut — Tiefe ausbauen erlaubt |

Auch das **Reporting** (Kap. 29/35: Umsatz/Aufträge, Aufrisse, operative KPIs, KI) zählt
zum differenzierenden, demo-tauglichen Vergleichswert und bleibt im Fokus.

**Zurückstellen** (kein weiterer Eigenbau-Ausbau bis zur Entscheidung) — der regulierte
Standard-Block, den jedes Buy-System mitbringt:

| Block | Code (bereits vorhanden) | Maßnahme |
|---|---|---|
| Auth/RBAC/2FA (C1) | `apps/api/src/modules/auth/*`, `crypto.ts`, `rbac.ts` | **einfrieren** (s. Leitplanke 2) |
| Banking-Abgleich (A3) | `banking-match.ts`, `camt053.ts`, `.../banking` | einfrieren — keine Vertiefung |
| Mahnwesen (A4) | `dunning.ts`, `.../dunning` | einfrieren — keine Vertiefung |
| E-Rechnung-Inbound | `einvoice-inbound.ts`, `.../incoming-invoice` | einfrieren — keine Vertiefung |
| GoBD-WORM-Infra (C5) | `packages/audit`, Objektspeicher-Anbindung offen | nicht weiter ausbauen |
| 3-Way-Match (9.6) | `three-way-match.ts` | einfrieren |

**Begründung:** Gewinnt Buy, ist dieser Eigenbau verloren; gewinnt Make, lässt er sich
danach bauen. Doppelarbeit **vor** der Entscheidung wird vermieden. Das bereits Gebaute
wird **nicht gelöscht** (es trägt zur Demo bei), aber **nicht vertieft**.

> Hinweis: Mehrere „Zurückstellen"-Module wurden in früheren Iterationen bereits gebaut.
> „Zurückstellen" heißt hier **Feature-Freeze**, nicht Rückbau — der vorhandene Stand
> bleibt lauffähig und getestet, erhält aber keine neue Funktionstiefe.

---

## Leitplanke 2 — Auth / Identity / Krypto nicht selbst bauen

Die sicherheitskritische Querschnittsschicht (Session, TOTP-2FA, Passwort-Hashing,
Credential-Verschlüsselung, RBAC-Durchsetzung) wird über eine **etablierte Auth-/Identity-
Lösung** eingebunden statt von Hand implementiert. Selbst gebaute Auth/Krypto ist die
gefährlichste Angriffsfläche, härtet sich nicht selbst nach und wächst mit der Codebasis.
**Gilt unabhängig vom Make-or-Buy-Ausgang.** C1 wird daher **nicht** als Eigenimplementierung
vorangetrieben.

### Ist-Stand (ehrliche Bestandsaufnahme)

| Baustein | Heute | Bewertung |
|---|---|---|
| Passwort-Hashing | `@node-rs/argon2` (vetted lib) | ✅ keine selbstgebaute Kryptomathematik |
| TOTP/2FA | `otpauth` (vetted lib) | ✅ keine selbstgebaute Kryptomathematik |
| Session-Ausgabe/-Lockout | **eigen** (`auth.service.ts`, `token.ts`) | ⚠️ selbst gebaut → ablösen |
| Credential-Tresor (AES-256-GCM) | **eigen** (`crypto.ts`, `node:crypto`) | ⚠️ selbst komponiert → ablösen/auslagern |
| RBAC-Durchsetzung | **eigen** (`roleProcedure`, `redactOrderForRole`) | ⚠️ Policy-Layer bleibt fachlich, Identität externalisieren |

### Zielbild

- **Identität + Session + 2FA**: externe Auth-/Identity-Lösung (z. B. gehosteter OIDC-/
  Identity-Provider). Die App konsumiert Tokens/Claims, statt Sessions selbst auszustellen.
- **Credential-Verschlüsselung** (Shop-/Lieferanten-Secrets): Secrets-Manager des Providers
  bzw. der Plattform statt selbst komponierter AES-GCM-Schicht.
- **RBAC**: die **fachliche** Rechtelogik (z. B. „PRODUKTION sieht keine Preise") bleibt im
  Code, wird aber an die externen Identitäts-Claims gebunden, nicht an eigene Nutzer-/
  Session-Tabellen.

**Status der Umsetzung:** entschieden — **„höchster Sicherheitsstandard ist Maxime"**. Erster
Schritt umgesetzt: OIDC-Identitätsprüfung per `jose` (`apps/api/src/modules/auth/oidc.ts`),
Server bevorzugt den Bearer-Pfad; Cookie-Session ist Übergangs-Fallback (deprecated). Details:
`docs/adr/0001-auth-oidc-externalisierung.md`. Bis zur Provider-Anbindung bleibt der
vorhandene Auth-Code **eingefroren** (keine neue Funktion, nur Sicherheits-Bugfixes).

---

## Leitplanke 3 — Bus-Faktor als hartes Bauziel + Entscheidungs-Gate

Betriebsrisiko (Kap. 24.2): Das gesamte operative System hängt an einer Person.
Gegenmaßnahmen sind **feste Bestandteile, nicht optional**:

- **Lückenlose Doku** als Dauerpflicht (Verfahrensdokumentation, ADRs, Onboarding-Pfad).
- **„Ein Zweiter kann übernehmen"** als **Abnahmekriterium** — nicht nur Wunsch.
- Möglichst **ein zweiter Mensch mit echtem Code-Zugang** (Review, Deploy-Rechte).

### Entscheidungs-Gate (Make-or-Buy)

- **Trigger:** definiert — z. B. nach Abschluss der Buy-Demos am echten TEXMA-Fall.
- **Wenige harte Kriterien:** Betriebsrisiko/Bus-Faktor · Wartungslast · Time-to-Live ·
  5-Jahres-Gesamtkosten (TCO).
- **Sunk-Cost-Regel:** Die bereits investierte Greenfield-Zeit ist **KEIN** Kriterium. Die
  Entscheidung blickt **nach vorn**.

---

## Konsequenzen für die Roadmap (Kurzfassung)

1. **Weiterbauen:** Tiefe der differenzierenden Module (A2/A6/A7/A8) + Reporting, soweit es
   den Demo-/Vergleichswert erhöht.
2. **Einfrieren:** Standard-Block (Auth-Eigenbau, Banking, Mahnwesen, E-Rechnung-Inbound,
   3-Way-Match, GoBD-WORM-Infra) — vorhandener Stand bleibt, keine Vertiefung.
3. **Auth externalisieren:** C1 nicht als Eigenbau fortführen; Migrationspfad auf externe
   Identity-Lösung planen (offene Entscheidung).
4. **Bus-Faktor:** Doku + „Zweiter kann übernehmen" als laufendes Abnahmekriterium führen;
   Entscheidungs-Gate mit den vier harten Kriterien vorbereiten.

## Entschieden (TEXMA / Projektleitung)

- **Auth-Migration:** **jetzt**, Sicherheit als Maxime. OIDC-Verifikation per `jose` ist
  eingebaut (Bearer bevorzugt, Cookie-Session deprecated). Siehe
  `docs/adr/0001-auth-oidc-externalisierung.md`.
- **Buy-Stack festgelegt (Microsoft-zentriert):**
  - **Identität → Microsoft Entra ID** (OIDC). Issuer `https://login.microsoftonline.com/{tenant}/v2.0`,
    Rollen über App Roles → `OIDC_ROLE_CLAIM`.
  - **Secrets → Azure Key Vault** (per Managed Identity; löst `crypto.ts`/`SECRETS_KEY` ab).
  - **Banking → finAPI** (PSD2 AIS/PIS, BaFin-lizenziert, DE-Hosting); hinter `BankingProvider`-Port.
  - **FiBu/E-Rechnung → DATEV-Anbindung + EN-16931-Bibliothek** statt Eigenbau.
  - Begründung/Details: `docs/adr/0002-buy-stack-entra-keyvault-finapi-datev.md`.
- **Standard-Block (Banking, Mahnwesen, E-Rechnung-Inbound, 3-Way-Match):** **Buy/Integrate.**
  Reguliertes Commodity wird integriert, nicht weiter vertieft. Der vorhandene C1-Eigenbau
  bleibt **eingefrorener Interim hinter Ports**, bis die Integration steht.

## Zusätzlich erledigt

- **Schritt 1 — `SecretsProvider`-Port: abgeschlossen.** Port + AES-GCM-Dev-Fallback +
  Azure-Key-Vault-Adapter (lazy, Managed Identity) + Backend-Auswahl in
  `packages/shared/src/secrets.ts`; alle drei Connector-Consumer (Worker-Runtime, Woo-/
  Supplier-Runner) nutzen den Port statt `decryptSecret`/`loadSecretsKey`. Voll getestet,
  Workspace baut grün. Details: `docs/adr/0002-…` (Offene Punkte #1).

## Verbleibend offen

- **finAPI-Kontotyp:** PSD2-Pfad (wenige Konten, ~90-Tage-SCA-Reconsent) vs. EBICS/Corporate
  (voll-unbeaufsichtigter Tagesabruf). Klärt den Connector-Zuschnitt.
- Reihenfolge/Termine der Integrationen (Entra-Tenant, Key-Vault-Bereitstellung, DATEV-Mandant).
