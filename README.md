# Blue Moth Desktop 1.4.1

**Standard-Anmeldung:** Benutzername `mothy`, Passwort `blue777` (wird beim allerersten Start automatisch angelegt; eigene Konten über „Registrieren“, mindestens 3 Zeichen).

## Neu in 1.4.0
- Anmeldefenster (lokale Konten, Passwort mit scrypt gehasht, getrennte Bibliothek pro Konto)
- Optional: Anmeldung/Verknüpfung mit Google (eigene OAuth-Client-ID nötig, siehe „Google einrichten“)
- Eingebauter Retro-Emulator (EmulatorJS): NES, SNES, Game Boy/Color/Advance, Mega Drive, Master System, Game Gear, PC Engine, N64, DS, PS1. Der Emulator-Kern wird beim Spielen aus dem Internet geladen.
- PC-Spiele und Verknüpfungen (.exe, .lnk, .url, .bat); .url-Internetverknüpfungen mit http(s) werden zu Web-Apps
- EXE-Dateien werden am Originalort gestartet


## Fertige EXE per GitHub (empfohlen)
Siehe `.github/workflows/build.yml`: Repository anlegen, alle Dateien hochladen, unter Actions "Run workflow" starten, danach unter Artifacts die EXE herunterladen. `Blue-Moth-1.3.0-x64.exe` ist die portable Einzeldatei ohne Installation.

## Einfacher Windows-Build (lokal)

1. Installiere Node.js LTS von https://nodejs.org/.
2. Entpacke diesen Ordner vollständig.
3. Doppelklicke `START-BLUE-MOTH.cmd`.
4. Warte, bis der Build abgeschlossen ist.
5. Der Windows-Installer wird im Ordner `dist` erzeugt.

Der erste Build benötigt Internet, weil npm Electron und electron-builder herunterlädt. Das Skript zeigt Fehler an und hält das Fenster offen.

## Fehlerbehebung beim Öffnen (1.2.1)
- EXE-Start wartet jetzt auf die Windows-Rückmeldung und zeigt Startfehler verständlicher an.
- Webadressen werden mit dem Standardbrowser geöffnet; Fehler werden angezeigt.
- Bei ROM-Dateien wird klargestellt, dass ein Emulator erforderlich ist.

## Funktionen
- Web-Apps per http/https-Adresse hinzufügen
- EXE-Dateien lokal importieren und starten
- Spiele-/ROM-Dateien importieren
- Optional einen installierten Emulator für ROM-Dateien auswählen
- Blue-Moth-Logo, Splashscreen und Hintergrund

## Grenzen
- Diese ZIP enthält keine bereits kompilierte Windows-EXE. Der Build muss auf Windows mit Node.js und Internet ausgeführt werden.
- Importierte Programme und Spiele werden lokal gespeichert. Keine Cloud-Synchronisierung ist enthalten.
- ROM-Dateien benötigen einen separat installierten, kompatiblen Emulator.
- Nur vertrauenswürdige EXE-Dateien und rechtmäßig verwendbare Spiele-Dateien importieren.
