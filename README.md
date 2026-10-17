# 🌙 Moon-Cord

Ein eigener Discord-Client im **Moon-Design** (Nachtblau + Lila) – passend zum [Moon-Windows-Theme](https://github.com/Luna-OS/Moon-Windows-Theme).

- **Moon-Theme eingebaut**: Hintergründe, Kanalliste, Chat, Popups, Buttons, Links und Text in den Moon-Farben (`#130F28`, `#1A1535`, `#8E7CFF`, `#B8ABFF`, `#EEEAFF` …).
- **Nitro-Themes werden überschrieben**: Hat dein Account ein Nitro-Farbverlauf-Theme aktiv, zeigt Moon-Cord trotzdem Moon. (Abschaltbar in den Plugin-Einstellungen.)
- **Moon-Hintergründe**: Mondnacht, Mondsichel, Horizont, Sternenhimmel, nur Verlauf oder ein eigenes Bild – halbtransparent hinter Chat und Kanalliste.
- **Alle Vencord-Plugins an Bord** (über 160). Beliebte Plugins sind beim ersten Start schon an, alle anderen lassen sich mit einem Klick einschalten.
- **Eigene App** mit Moon-Icon, Moon-Ladebildschirm und automatischen Updates aus diesem Repository.
- **Tastenkürzel auch im Spiel**: Push-to-Talk, Stummschalten, Ton aus und Push-to-Mute aus Discords eigenen Einstellungen (Sprache & Video bzw. Tastenkürzel) funktionieren auch, wenn Moon-Cord im Hintergrund ist – bei Vesktop gehen sie nur im Vordergrund.
- **Spiel zuerst beim Streamen**: Solange du überträgst, bekommt dein Spiel unter Windows Vorrang vor Moon-Cord, und der „Inhaltstyp“ aus dem Übertragungs-Fenster gilt jetzt auch unter Windows („Bewegung“ senkt bei knapper Leistung die Auflösung statt voll weiterzurechnen).
- **Überall Moon-Cord**: Einstellungen, Menüs, Tray und Meldungen heißen Moon-Cord statt Vencord/Vesktop ([`scripts/rebrand.mjs`](scripts/rebrand.mjs) ändert nur sichtbare Texte, keinen Code).

## ⭐ Moon-Cord im echten Discord (empfohlen)

Statt einer eigenen App kommt Moon-Cord direkt in dein **installiertes, offizielles Discord**. Damit hast du alles vom normalen Discord – eigener Sprach- und Stream-Motor (Kodierung über die Grafikkarte, kein Ruckeln im Spiel), globale Tastenkürzel, Krisp-Rauschunterdrückung, Overlay – plus Moon-Theme und alle Vencord-Plugins.

1. [`Moon-Cord-Discord-Installer.exe`](https://github.com/Luna-OS/Moon-Cord/releases/latest/download/Moon-Cord-Discord-Installer.exe) herunterladen und starten.
2. **1** drücken (Installieren). Discord wird kurz beendet und startet im Moon-Design neu.

- Funktioniert mit Discord, PTB und Canary. Linux: [`moon-cord-discord-installer-linux`](https://github.com/Luna-OS/Moon-Cord/releases/latest/download/moon-cord-discord-installer-linux).
- **Updates** von Moon-Cord kommen automatisch (Vencords Updater). Nach Discord-Updates klinkt sich Moon-Cord selbst wieder ein; falls nicht, den Installer einfach noch einmal starten.
- **Entfernen**: Installer starten → **2**. Discord ist danach wieder exakt original.
- So funktioniert es: Wie beim offiziellen Vencord-Installer wird Discords `resources/app.asar` zu `_app.asar` umbenannt; eine kleine neue `app.asar` lädt Moon-Cord aus `%APPDATA%\Moon-Cord-Discord` und danach das Original-Discord. Quellcode: [`installer/`](installer).

## Eigene App (auf Vesktop-Basis)

Unter [**Releases**](https://github.com/Luna-OS/Moon-Cord/releases/latest) herunterladen:

| System | Datei |
| --- | --- |
| Windows | `Moon-Cord-Setup-<version>.exe` (Installer) oder `Moon-Cord-<version>-win.zip` (ohne Installation) |
| Linux | `.AppImage`, `.deb` oder `.tar.gz` |

Der Windows-Installer ist nicht signiert. Wenn Windows „Der Computer wurde durch Windows geschützt“ meldet: **Weitere Informationen → Trotzdem ausführen**.

Beim ersten Start fragt Moon-Cord nach ein paar Einstellungen (Autostart, Rich Presence, Tray). „Import Settings“ übernimmt Plugins und Einstellungen aus einer vorhandenen Vencord-Installation.

## Einstellungen

**Benutzereinstellungen → Moon-Cord → Plugins → MoonCord**

| Einstellung | Bedeutung |
| --- | --- |
| Hintergrund | Mondnacht, Mondsichel, Horizont, Sternenhimmel, nur Moon-Verlauf, eigenes Bild oder keiner |
| Eigenes Bild | Bild-URL für „Eigenes Bild“. Erlaubt sind die Bild-Hosts, die Vencord freigibt (z. B. imgur, GitHub). |
| Sichtbarkeit | Wie stark der Hintergrund durch Chat und Listen scheint |
| Nitro-Themes ersetzen | An (Standard): immer Moon. Aus: ein aktives Nitro-Theme wird angezeigt. |

Client-Einstellungen (Tray, Autostart, Fenster) findest du unter **Benutzereinstellungen → Moon-Cord**.

## Wie es funktioniert

Moon-Cord baut auf zwei Open-Source-Projekten auf, die beim Bauen in festen Versionen geholt werden (`upstream.json`):

- [**Vencord**](https://github.com/Vendicated/Vencord) – die Plugins. Dazu kommt das Moon-Plugin aus [`plugin/moonCord`](plugin/moonCord).
- [**Vesktop**](https://github.com/Vencord/Vesktop) – der Desktop-Client. [`scripts/patch-vesktop.mjs`](scripts/patch-vesktop.mjs) macht daraus Moon-Cord (Name, Icons, Farben, eingebautes Moon-Vencord, Updates aus diesem Repo).

Das Moon-Theme färbt Discords Grundpaletten um ([`palette.css`](plugin/moonCord/palette.css), erzeugt von [`scripts/generate-palette.mjs`](scripts/generate-palette.mjs)). Dadurch ändern sich alle Flächen und Texte auf einmal. Den Hintergrund legt es über dieselbe Technik, die Discord für Nitro-Themes nutzt – mit `!important`, sodass ein aktives Nitro-Theme immer überschrieben wird. Zusätzlich meldet Discords Theme-Speicher „kein Nitro-Theme“, solange Moon aktiv ist.

## Selbst bauen

Voraussetzungen: Node.js 22+, pnpm 11, Git.

```sh
node scripts/build.mjs                 # Vencord + Client bauen
pnpm start                             # Moon-Cord direkt starten
node scripts/build.mjs --dist --win    # Windows-Installer nach dist/
node scripts/build.mjs --dist --linux  # AppImage, .deb, .tar.gz nach dist/
```

Weitere Skripte:

- `node scripts/generate-palette.mjs` – Moon-Palette neu aus Discords aktuellem CSS erzeugen (falls Discord seine Farben ändert)
- `node scripts/generate-icons.mjs` – Icons aus `desktop/assets/*.svg` neu rendern (braucht Playwright)

## Updates

- **Moon-Cord aktualisiert sich selbst** – ohne Installer und ohne Klicken. Updates werden im Hintergrund geladen (nur die geänderten Teile) und still installiert: direkt beim Start, wenn eins bereitliegt, sonst beim Schließen. Mitten in einem Anruf wird nie neu gestartet. Wer nicht warten will: auf die Benachrichtigung klicken oder im Tray „Restart“.
- **Sicherheitsupdates kommen automatisch**: Der Workflow [`auto-update.yml`](.github/workflows/auto-update.yml) prüft jeden Tag, ob es neue Vencord- oder Vesktop-Versionen gibt (Plugin-Reparaturen nach Discord-Updates, Electron-/Chromium-Sicherheitsupdates). Wenn ja, baut er Windows und Linux, veröffentlicht ein neues Release und alle Clients holen es sich still. Schlägt der Build fehl, wird nichts veröffentlicht und GitHub schickt eine Mail.
- Plugin-Updates ohne App-Neustart lädt zusätzlich Vencords eigener Updater (Moon-Cord → Updater).

## Neue Version veröffentlichen

1. Optional Vencord/Vesktop aktualisieren: neue Commits in `upstream.json` eintragen.
2. `version` in `package.json` erhöhen.
3. Auf `main` mergen – der **Release**-Workflow baut Windows und Linux und veröffentlicht das Release automatisch.

Installierte Clients finden die neue Version selbst und installieren sie still.

## Lizenz

Die eigenen Dateien dieses Repositorys stehen unter der [MIT-Lizenz](LICENSE). Die gebaute App enthält Vencord und Vesktop, die unter der [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) stehen; damit steht auch die fertige App unter der GPL-3.0. Das Moon-Plugin (`plugin/moonCord`) ist GPL-3.0-or-later, weil es Teil von Vencord wird.

Moon-Cord ist kein offizielles Vencord- oder Vesktop-Projekt. Bitte meldet Probleme hier und nicht im Vencord-Support. Client-Mods verstoßen gegen Discords Nutzungsbedingungen; Moon-Cord verhält sich dabei wie Vencord/Vesktop.
