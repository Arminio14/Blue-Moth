@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo             BLUE MOTH - BUILD
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte installiere die LTS-Version von https://nodejs.org/ und starte diese Datei erneut.
  echo.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm wurde nicht gefunden. Bitte Node.js LTS neu installieren.
  pause
  exit /b 1
)
echo Starte den Blue-Moth-Build. Beim ersten Mal werden Dateien aus dem Internet geladen.
echo Dieses Fenster bitte offen lassen.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Blue-Moth.ps1"
set RESULT=%ERRORLEVEL%
echo.
if not "%RESULT%"=="0" (
  echo Der Build ist fehlgeschlagen. Lies die Fehlermeldung oben.
) else (
  echo Fertig! Der Installer liegt im Ordner dist.
)
echo.
pause
exit /b %RESULT%
