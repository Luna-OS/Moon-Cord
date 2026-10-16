/*
 * Moon-Cord – Tastenkürzel im Spiel + Übertragungs-Status (Discord-Seite)
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Gegenstück zu globalKeybinds.ts / streamPriority.ts im Hauptprozess:
 * - meldet, ob gerade übertragen wird und welche Tasten Discord als Kürzel nutzt
 * - führt Push-to-Talk, Stummschalten und Ton aus, wenn die Taste gedrückt wird,
 *   während Moon-Cord im Hintergrund ist (im Vordergrund macht Discord das selbst)
 */

import { Logger } from "@vencord/types/utils";
import { findByPropsLazy, findStoreLazy } from "@vencord/types/webpack";
import { FluxDispatcher, MediaEngineStore } from "@vencord/types/webpack/common";
import { onIpcCommand } from "renderer/ipcCommands";
import { isStreaming } from "renderer/streamReuse";

const logger = new Logger("MoonCordKeybinds", "#8e7cff");

const KeybindsStore = findStoreLazy("KeybindsStore");
const AudioActions = findByPropsLazy("toggleSelfMute", "setTemporarySelfMute");

interface Keybind {
    id: string;
    action: string;
    shortcut: [type: number, code: number, device?: string][];
    enabled?: boolean;
    context?: string | null;
}

const ACTIONS = new Set(["PUSH_TO_TALK", "PUSH_TO_TALK_PRIORITY", "PUSH_TO_MUTE", "TOGGLE_MUTE", "TOGGLE_DEAFEN"]);

// Strg/Umschalt/Alt/Windows: Discord speichert je nach Weg die allgemeine oder die linke
// Variante – beide Seiten der Tastatur sollen zählen
const MODIFIER_GROUPS = [
    [16, 160, 161],
    [17, 162, 163],
    [18, 164, 165],
    [91, 92]
];

function variants(type: number, code: number) {
    if (type === 0) {
        const group = MODIFIER_GROUPS.find(g => g.includes(code));
        if (group) return group.map(c => `${type}:${c}`);
    }
    return [`${type}:${code}`];
}

function getKeybinds(): Keybind[] {
    const state = KeybindsStore?.getUserAgnosticState?.() ?? {};
    return Object.values(state as Record<string, Keybind>).filter(
        k =>
            k?.enabled !== false &&
            ACTIONS.has(k.action) &&
            (k.context == null || k.context === "default") &&
            k.shortcut?.length &&
            k.shortcut.every(([type]) => type === 0 || type === 1)
    );
}

const pressed = new Set<string>();
const active = new Set<string>(); // IDs der gerade gedrückten Kürzel

function isDown(type: number, code: number) {
    return variants(type, code).some(v => pressed.has(v));
}

function setPushToTalk(on: boolean, priority: boolean) {
    const engine = MediaEngineStore as any;
    if (engine.getMode?.() !== "PUSH_TO_TALK") return;

    FluxDispatcher.dispatch({ type: "PUSH_TO_TALK_STATE_CHANGE", isActive: on, isPriority: priority });
    engine.getMediaEngine().eachConnection((c: any) => c.setForceAudioInput(on, priority, false), "default");
}

function run(action: string, down: boolean) {
    switch (action) {
        case "PUSH_TO_TALK":
            return setPushToTalk(down, false);
        case "PUSH_TO_TALK_PRIORITY":
            return setPushToTalk(down, true);
        case "PUSH_TO_MUTE":
            return AudioActions.setTemporarySelfMute(down);
        case "TOGGLE_MUTE":
            if (down) AudioActions.toggleSelfMute();
            return;
        case "TOGGLE_DEAFEN":
            if (down) AudioActions.toggleSelfDeaf();
            return;
    }
}

onIpcCommand("moon:keybind", ({ type, code, down }: { type: number; code: number; down: boolean }) => {
    const key = `${type}:${code}`;
    if (down) pressed.add(key);
    else pressed.delete(key);

    // Im Vordergrund reagiert Discord selbst – sonst würde z. B. Stummschalten doppelt umschalten
    const focused = document.hasFocus();

    for (const bind of getKeybinds()) {
        const isActive = bind.shortcut.every(([t, c]) => isDown(t, c));
        const wasActive = active.has(bind.id);
        if (isActive === wasActive) continue;

        if (isActive) active.add(bind.id);
        else active.delete(bind.id);

        // Loslassen immer weitergeben, damit Push-to-Talk nie "hängen" bleibt
        if (focused && isActive) continue;
        try {
            run(bind.action, isActive);
        } catch (e) {
            logger.error("Tastenkürzel fehlgeschlagen:", bind.action, e);
        }
    }
});

onIpcCommand("moon:status", () => {
    let keybinds: string[] = [];
    try {
        keybinds = [...new Set(getKeybinds().flatMap(k => k.shortcut.flatMap(([t, c]) => variants(t, c))))];
    } catch (e) {
        logger.error("Kann Tastenkürzel nicht lesen", e);
    }

    return { streaming: isStreaming(), keybinds };
});
