# Make-or-Buy-Leitplanken (verbindlich)

> Status: **verbindlich** ab Review-Datum. Quelle: Make-or-Buy-Review zum TEXMA-ERP.
> Bezug: Lastenheft Kap. 24.2 (Bus-Faktor), Kap. 30/31.1 (Buy-Kandidaten Xentral/reybex/
> orgaMAX), ADR 0002 (Buy-Stack), `docs/xentral-alignment.md` (Xentral/OpenXE als fachliche Referenz).

## Ausgangslage — Teil-Make entschieden

Die Make-or-Buy-Frage ist **zugunsten von Teil-Make entschieden** (Lastenheft Kap. 24.1):
ein gekaufter/integrierter Standard-Kern plus **gezielter Eigenbau nur an den
differenzierenden Stellen**. K-16 und K-24 sind damit **nicht gegenstandslos, sondern
entschieden** — die Bewertungsmatrix (Kap. 30) ist zugunsten Teil-Make aufgelöst.

- **Selbst gebaut (Moat):** die vier Differenzierer — Stickerei-Partnerlogik (A7),
  mehrstufige Fremdvergabe (A2), Nachkalkulation (A6), Termin/Ampel (A8). Hier liegt der
  Wettbewerbsvorteil; kein Standard-ERP kann das von der Stange.
- **Eingekauft/integriert:** der regulierte Standard-Block — Identität, Secrets, Banking,
  FiBu/Mahnwesen, E-Rechnung. Reguliertes Commodity ohne Differenzierungswert; bei Eigenbau
  dauerhafte Compliance-Last und Klumpenrisiko (Kap. 24.2).

Konkretisiert ist der Buy-Stack in **ADR 0002** (Entra ID · Azure Key Vault · finAPI ·
DATEV/EN-16931). Die drei Leitplanken unten bleiben gültig — sie steuern jetzt die
**Teil-Make-Umsetzung** (Differenzierer bauen, Standard-Block integrieren statt vertiefen).

### Zielarchitektur Standard-Block (Buy/Integrate)

| Schicht | Lösung (Buy/Integrate) | Status |
|---|---|---|
| **Identität / Auth / 2FA** | Microsoft Entra ID (OIDC, per `jose` verifiziert); RBAC über App-Roles-Claim (Kap. 12/14) | Verifier eingebaut (ADR 0001), Entra-Konfiguration ausstehend |
| **Secrets** | Azure Key Vault über Managed Identity (`SecretsProvider`-Port); AES-GCM nur Dev-Fallback | Port + Adapter umgesetzt (ADR 0002 #1) |
| **Banking** | finAPI (AIS/PIS, BaFin-lizenziert) hinter `BankingProvider`-Port | Port-Zuschnitt offen (Kontotyp) |
| **FiBu / E-Rechnung** | DATEV-Anbindung + validierte EN-16931-Bibliothek — Standard nicht handpflegen | geplant |

Frühere Formulierungen („Greenfield-Make ist gesetzt", „Fachlogik-Breite zuerst", „C1 als
Eigenbau") sind durch dieses Teil-Make-Framing **ersetzt**.

---

## Leitplanke 1 — Fokus-Schnitt: differenzierend bauen, Standard-Block integrieren

**Vorrang** auf die Module, die ein Standard-ERP NICHT von der Stange kann und die den
Wettbewerbsvorteil (Moat) bilden:

| Modul | Code | Stand |
|---|---|---|
| Mehrstufige Fremdvergabe (A2) | `packages/shared/src/subproduction.ts`, `apps/api/.../subproduction` | ✅ gebaut — Tiefe ausbauen erlaubt |
| Stickerei-Partnerlogik (A7) | `packages/shared/src/stickerei.ts`, `apps/api/.../stickerei` | ✅ gebaut — Tiefe ausbauen erlaubt |
| Termin/Ampel (A8) | `packages/shared/src/ampel.ts`, `apps/api/.../ampel` | ✅ gebaut — Tiefe ausbauen erlaubt |
| Nachkalkulation (A6) | `packages/shared/src/postcalc.ts`, `apps/api/.../postcalc` | ✅ gebaut — Tiefe ausbauen erlaubt |

Auch das **Reporting** (Kap. 29/35: Umsatz/Aufträge, Aufrisse, operative KPIs, KI) zählt
zum differenzierenden Bereich und bleibt im Fokus.

**Buy/Integrate** (kein Tiefenausbau im Eigenbau) — der regulierte Standard-Block wird an
etablierte Lösungen angebunden; der vorhandene Eigenbau bleibt nur **dünner Interim hinter
Ports**, bis die Integration steht:

| Block | Code (bereits vorhanden) | Maßnahme (Buy/Integrate) |
|---|---|---|
| Auth/RBAC/2FA (C1) | `apps/api/src/modules/auth/*`, `crypto.ts`, `rbac.ts` | **kein Eigenbau mehr** — Entra-ID-Integration (OIDC-Verifier vorhanden) + Konfiguration Issuer/JWKS/Roles-Claim; Session/TOTP/argon2-Eigenbau eingefroren (Leitplanke 2) |
| Banking-Abgleich (A3) | `banking-match.ts`, `camt053.ts`, `.../banking` | Reconciliation-Logik bleibt, aber auf **finAPI-Kontodaten** (`BankingProvider`-Port) — kein eigener FinTS/CAMT-Zugang |
| Mahnwesen (A4) | `dunning.ts`, `.../dunning` | an die **DATEV-Welt** anbinden; Eigenbau nur dünner Interim |
| 3-Way-Match (A5, Kap. 9.6) | `three-way-match.ts` | an die **DATEV-Welt** anbinden; Eigenbau nur dünner Interim |
| E-Rechnung-Inbound (C4) | `einvoice-inbound.ts`, `.../incoming-invoice` | über die **EN-16931-Bibliothek** kapseln, nicht handpflegen |
| GoBD-WORM-Infra (C5) | `packages/audit`, Objektspeicher-Anbindung offen | nicht weiter ausbauen |

**Begründung:** Der Standard-Block ist reguliertes Commodity ohne Differenzierungswert; ihn
selbst zu vertiefen erzeugt nur Compliance- und Bus-Faktor-Last (Kap. 24.2). Das bereits
Gebaute wird **nicht gelöscht** (es trägt zur Demo bei und überbrückt bis zur Integration),
aber **nicht vertieft**.

> Hinweis: „Interim hinter Ports" heißt **Feature-Freeze**, nicht Rückbau — der vorhandene
> Stand bleibt lauffähig und getestet hinter der Port-Schnittstelle, bis die eingekaufte
> Lösung dahinter tritt.

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

### Zielbild (festgelegt, ADR 0002)

- **Identität + Session + 2FA → Microsoft Entra ID** (OIDC). Die App konsumiert verifizierte
  Tokens/Claims, statt Sessions selbst auszustellen. 2FA wird beim IdP erzwungen.
- **Credential-Verschlüsselung** (Shop-/Lieferanten-Secrets) **→ Azure Key Vault** über
  Managed Identity (`SecretsProvider`-Port) statt selbst komponierter AES-GCM-Schicht; AES-GCM
  bleibt nur Dev-Fallback.
- **RBAC**: die **fachliche** Rechtelogik (z. B. „PRODUKTION sieht keine Preise") bleibt im
  Code, wird aber an den **Entra-App-Roles-Claim** gebunden, nicht an eigene Nutzer-/
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

### Entscheidungs-Gate (Make-or-Buy) — aufgelöst zu Teil-Make

Das Gate ist **entschieden: Teil-Make** (Standard-Block Buy/Integrate, vier Differenzierer
selbst). Die Kriterien bleiben als Begründung und für künftige Einzelfälle dokumentiert:

- **Wenige harte Kriterien:** Betriebsrisiko/Bus-Faktor · Wartungslast · Time-to-Live ·
  5-Jahres-Gesamtkosten (TCO) — sprechen beim regulierten Standard-Block klar für Buy.
- **Sunk-Cost-Regel:** Die bereits investierte Greenfield-Zeit ist **KEIN** Kriterium. Die
  Entscheidung blickt **nach vorn** — der vorhandene Eigenbau bleibt nur Interim hinter Ports.

---

## Konsequenzen für die Roadmap (Kurzfassung)

1. **Weiterbauen (Moat):** die vier Differenzierer (A2/A6/A7/A8) + Reporting als
   **demo-fähiger Durchstich** — nächste Bau-Priorität nach Leitplanke 1 (Fokus-Schnitt):
   `subproduction`, `stickerei`, `ampel`, `postcalc` an die Endpunkte/UI bringen. Kein
   weiterer Standard-Block-Eigenbau.
2. **Buy/Integrate:** Standard-Block (Identität, Secrets, Banking, FiBu/Mahnwesen, 3-Way-Match,
   E-Rechnung-Inbound) an Entra ID / Key Vault / finAPI / DATEV+EN-16931 anbinden; vorhandener
   Eigenbau bleibt dünner Interim hinter Ports, keine Vertiefung.
3. **Auth externalisieren:** C1 als Entra-ID-Integration (Verifier vorhanden) + Konfiguration —
   **entschieden**, kein Eigenbau-Fortführung.
4. **Bus-Faktor:** Doku + „Zweiter kann übernehmen" als laufendes Abnahmekriterium führen.

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
