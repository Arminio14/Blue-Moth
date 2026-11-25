$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host 'Blue Moth - Windows Installer wird erstellt' -ForegroundColor Cyan
Write-Host ''

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  throw 'Node.js/npm fehlt. Installiere Node.js LTS von https://nodejs.org/ und starte START-BLUE-MOTH.cmd erneut.'
}

Write-Host ('Node.js: ' + (& node --version))
Write-Host 'Installiere Build-Abhaengigkeiten ...' -ForegroundColor Yellow
& npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install ist fehlgeschlagen.' }

Write-Host 'Erstelle Windows-Installer ...' -ForegroundColor Yellow
& npm run dist:win
if ($LASTEXITCODE -ne 0) { throw 'Der Windows-Build ist fehlgeschlagen.' }

Write-Host ''
Write-Host 'ERFOLG: Suche den Installer im Ordner dist.' -ForegroundColor Green
Get-ChildItem -Path (Join-Path $PSScriptRoot 'dist') -Filter '*.exe' -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_.FullName -ForegroundColor Green }
