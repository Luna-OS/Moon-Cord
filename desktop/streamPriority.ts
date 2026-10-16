/*
 * Moon-Cord – Spiel zuerst, solange du überträgst
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Beim Übertragen kodiert Moon-Cord (wie jede Browser-Version von Discord) das Bild
 * auf dem Prozessor. Das konkurriert direkt mit dem Spiel um Rechenzeit – das Spiel
 * ruckelt. Solange eine Übertragung läuft, stellt Moon-Cord seine eigenen Prozesse
 * unter Windows auf "niedriger als normal": Ist der Prozessor knapp, bekommt das
 * Spiel den Vortritt; schlimmstenfalls ruckelt die Übertragung statt des Spiels.
 * Der Audio-Prozess bleibt normal, damit Sprache nicht abgehackt klingt.
 *
 * Außerdem: Moon-Cord fragt Discord alle paar Sekunden, ob übertragen wird und
 * welche Tastenkürzel eingestellt sind (siehe globalKeybinds.ts).
 */

import { app } from "electron";
import { constants, setPriority } from "os";

import { setWatchedKeybinds } from "./globalKeybinds";
import { sendRendererCommand } from "./ipcCommands";
import { mainWin } from "./mainWindow";

interface MoonStatus {
    streaming: boolean;
    keybinds: string[];
}

const POLL_EVERY = 3000;
let lowered = false;

function isAudioProcess(m: Electron.ProcessMetric) {
    return m.type === "Utility" && /audio/i.test(`${m.serviceName ?? ""} ${m.name ?? ""}`);
}

function applyPriority(low: boolean) {
    if (process.platform !== "win32") return;

    const priority = low ? constants.priority.PRIORITY_BELOW_NORMAL : constants.priority.PRIORITY_NORMAL;
    for (const metric of app.getAppMetrics()) {
        if (isAudioProcess(metric)) continue;
        try {
            setPriority(metric.pid, priority);
        } catch {}
    }
}

function setStreaming(streaming: boolean) {
    // Chromium setzt Prioritäten manchmal selbst zurück – beim Übertragen daher jedes Mal neu setzen
    if (streaming) applyPriority(true);
    else if (lowered) applyPriority(false);

    if (streaming !== lowered) {
        console.log(
            streaming
                ? "[Moon-Cord] Übertragung läuft – Spiel bekommt Vorrang"
                : "[Moon-Cord] Übertragung beendet – normale Priorität"
        );
    }
    lowered = streaming;
}

let polling = false;

async function poll() {
    if (polling || !mainWin || mainWin.isDestroyed() || mainWin.webContents.isLoading()) return;
    polling = true;

    try {
        const status = await Promise.race([
            sendRendererCommand<MoonStatus>("moon:status"),
            new Promise<null>(resolve => setTimeout(() => resolve(null), POLL_EVERY))
        ]);
        if (!status) return;

        setStreaming(status.streaming);
        setWatchedKeybinds(status.keybinds);
    } catch {
    } finally {
        polling = false;
    }
}

export function startMoonStatus() {
    setInterval(poll, POLL_EVERY);
}
