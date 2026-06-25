# Windows/PowerShell-Pendant zu scripts/dev-db-up.sh: startet Postgres 16 als Docker-
# Container mit denselben Zugangsdaten wie packages/db/.env (texma/texma @ :5432).
# Aufruf:  pwsh scripts/dev-db-up.ps1   (oder in PowerShell:  .\scripts\dev-db-up.ps1)

$ErrorActionPreference = "Stop"

# Docker vorhanden?
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker ist nicht installiert/gestartet." -ForegroundColor Red
  Write-Host "Optionen:" -ForegroundColor Yellow
  Write-Host "  1) Docker Desktop installieren: https://www.docker.com/products/docker-desktop/"
  Write-Host "  2) Ohne Docker: Postgres 16 nativ installieren (User/DB 'texma', PW 'texma') ODER"
  Write-Host "     eine Cloud-DB (z. B. https://neon.tech) nutzen und packages\db\.env auf deren"
  Write-Host "     DATABASE_URL setzen. Danach:  pnpm db:setup"
  exit 1
}

$name = "texma-pg"
$exists = docker ps -a --filter "name=^/$name$" --format "{{.Names}}"
if ($exists -eq $name) {
  Write-Host "Container '$name' existiert bereits — starte ihn." -ForegroundColor Cyan
  docker start $name | Out-Null
} else {
  Write-Host "Starte Postgres 16 ('$name') auf localhost:5432 ..." -ForegroundColor Cyan
  docker run --name $name -d `
    -p 5432:5432 `
    -e POSTGRES_USER=texma -e POSTGRES_PASSWORD=texma -e POSTGRES_DB=texma `
    postgres:16 | Out-Null
}

# Auf Bereitschaft warten (max ~30 s).
Write-Host "Warte auf DB-Bereitschaft ..." -NoNewline
for ($i = 0; $i -lt 30; $i++) {
  $ready = docker exec $name pg_isready -U texma -d texma 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host " bereit." -ForegroundColor Green; break }
  Start-Sleep -Seconds 1
  Write-Host "." -NoNewline
}

Write-Host ""
Write-Host "Postgres läuft. Verbindung wie in packages\db\.env:" -ForegroundColor Green
Write-Host "  postgresql://texma:texma@localhost:5432/texma?schema=public"
Write-Host ""
Write-Host "Weiter mit:  pnpm db:setup" -ForegroundColor Yellow
