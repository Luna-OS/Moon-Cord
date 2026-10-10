/*
 * Moon-Cord – automatische Updates ohne Neuinstallation
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Ersetzt Vesktops Updater. Statt eines Update-Fensters, in dem man klicken
 * muss und danach der Installer sichtbar läuft, macht Moon-Cord das selbst:
 *   - sucht beim Start und danach alle 2 Stunden nach Updates
 *   - lädt sie im Hintergrund herunter (nur die geänderten Teile)
 *   - installiert still: direkt beim Start, wenn das Update schon bereitliegt,
 *     sonst beim Beenden – oder sofort über die Benachrichtigung/das Tray-Menü
 * So wird nie mitten in einem Anruf neu gestartet.
 */

import { app, Notification } from "electron";
import { autoUpdater } from "electron-updater";
import { IpcEvents } from "shared/IpcEvents";
import { Millis } from "shared/utils/millis";

import { handle } from "./utils/ipcWrappers";

const CHECK_INTERVAL = 2 * Millis.HOUR;
// Liegt ein Update so kurz nach dem Start schon bereit, wird sofort installiert –
// da ist man noch in keinem Anruf.
const INSTALL_ON_START_WINDOW = 45 * Millis.SECOND;
const startedAt = Date.now();

let downloadedVersion: string | null = null;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;

export function installUpdateNow() {
    if (!downloadedVersion) return false;
    // still installieren und Moon-Cord danach wieder starten
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
}

export const hasDownloadedUpdate = () => downloadedVersion !== null;

autoUpdater.on("update-downloaded", info => {
    downloadedVersion = info.version;

    if (Date.now() - startedAt < INSTALL_ON_START_WINDOW) {
        console.log(`[Moon-Cord] Update ${info.version} liegt bereit – installiere beim Start`);
        installUpdateNow();
        return;
    }

    if (!Notification.isSupported()) return;
    const notification = new Notification({
        title: `Moon-Cord ${info.version} ist bereit`,
        body: "Wird beim nächsten Schließen automatisch installiert. Hier klicken, um jetzt neu zu starten.",
        silent: true
    });
    notification.on("click", installUpdateNow);
    notification.show();
});

autoUpdater.on("error", err => console.error("[Moon-Cord] Update fehlgeschlagen:", err?.message ?? err));

function checkForUpdates() {
    if (!app.isPackaged) return Promise.resolve(null);
    return autoUpdater.checkForUpdates().catch(err => {
        console.error("[Moon-Cord] Update-Suche fehlgeschlagen:", err?.message ?? err);
        return null;
    });
}

const firstCheck = checkForUpdates();
setInterval(checkForUpdates, CHECK_INTERVAL);

// Die Einstellungsseite fragt, ob Moon-Cord veraltet ist. Da Updates jetzt
// selbstständig kommen, ist das nur noch der Fall, wenn eins bereitliegt.
handle(IpcEvents.UPDATER_IS_OUTDATED, async () => {
    await firstCheck;
    return hasDownloadedUpdate();
});
handle(IpcEvents.UPDATER_OPEN, async () => {
    if (installUpdateNow()) return;
    await checkForUpdates();
});
