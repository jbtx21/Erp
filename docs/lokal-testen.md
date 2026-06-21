# TEXMA ERP lokal ausprobieren (Windows + Docker)

Diese Anleitung bringt die Oberfläche auf deinem **Windows-Rechner** zum Laufen, sodass du
alles durchklicken kannst. Datenbank läuft per **Docker** (du musst nichts an der DB
einstellen). Reine Klick-/Tipp-Anleitung — kein Vorwissen nötig.

---

## 1. Einmalig: vier Programme installieren

1. **Node.js (Version 22)** — https://nodejs.org → grüner Button **„LTS"** → Windows-Installer
   (`.msi`) herunterladen, ausführen, immer „Weiter" klicken.
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop → Windows-Installer,
   installieren, **starten**. Warten, bis das Wal-Symbol unten rechts „läuft" anzeigt.
3. **Git** — https://git-scm.com/download/win → installieren (alle Standardeinstellungen).
4. **pnpm** — danach **PowerShell** öffnen (Startmenü → „PowerShell" tippen) und eingeben:
   ```powershell
   npm install -g pnpm
   ```
   PowerShell danach einmal schließen und neu öffnen.

> Tipp: Nach jeder Installation PowerShell neu öffnen, damit die Befehle gefunden werden.

---

## 2. Den Code holen

In PowerShell (an einem Ort deiner Wahl, z. B. Dokumente):
```powershell
git clone https://github.com/jbtx21/Erp.git
cd Erp
```
*(Alternativ ohne Git: auf GitHub oben rechts **Code → Download ZIP**, entpacken, dann den
Ordner in PowerShell mit `cd` öffnen.)*

---

## 3. Einmalig: Zugangsdatei für die Datenbank anlegen
```powershell
Copy-Item packages\db\.env.example packages\db\.env
```

---

## 4. Starten

**a) Datenbank starten** (Docker muss laufen):
```powershell
docker compose -f docker-compose.dev.yml up -d
```

**b) Abhängigkeiten installieren + alles bauen + Datenbank einrichten** (einmalig, dauert ein paar Minuten):
```powershell
pnpm install
pnpm build
pnpm db:setup
```

**c) Backend starten** — dieses PowerShell-Fenster offen lassen:
```powershell
pnpm dev:api
```
*(Es erscheint „TEXMA Dev-API … läuft auf …". Fenster NICHT schließen.)*

**d) Oberfläche starten** — **zweites** PowerShell-Fenster öffnen, wieder `cd Erp`, dann:
```powershell
pnpm dev:web
```

**e) Im Browser öffnen:** http://localhost:5173 — links durch alle Bereiche klicken.

---

## 5. Später wieder starten
Programme sind installiert, Daten bleiben erhalten. Es genügen:
```powershell
docker compose -f docker-compose.dev.yml up -d   # Datenbank
pnpm dev:api                                      # Terminal 1
pnpm dev:web                                       # Terminal 2 (zweites Fenster)
```

## Stoppen
- In beiden PowerShell-Fenstern **Strg + C**.
- Datenbank anhalten (Daten bleiben): `docker compose -f docker-compose.dev.yml down`
- Datenbank inkl. Daten löschen (Neustart bei null): `docker compose -f docker-compose.dev.yml down -v`
  (danach beim nächsten Start wieder `pnpm db:setup`).

---

## Wenn etwas klemmt
| Problem | Lösung |
|---|---|
| `pnpm` / `docker` „nicht gefunden" | PowerShell neu öffnen; Docker Desktop gestartet? |
| `db:setup` Fehler „Can't reach database" | Docker Desktop läuft? Schritt 4a ausgeführt? |
| Port belegt (5432 / 3000 / 5173) | Anderes Programm auf dem Port beenden und neu starten |
| Seite lädt nicht | Läuft **beides** (`dev:api` + `dev:web`) in zwei Fenstern? |

## Zugangs-Hinweis
Der Dev-Server meldet dich automatisch als Demo-**Admin** an (kein Login-Bildschirm) —
so siehst du beim Durchklicken alle Bereiche ohne Rollen-Einschränkung.
