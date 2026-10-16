/*
 * Moon-Cord – Tastenkürzel auch im Spiel
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Vesktop kennt keine globalen Tastenkürzel: Push-to-Talk, Stummschalten und
 * Ton aus funktionieren nur, solange das Fenster vorne ist – im Spiel also nie.
 *
 * Moon-Cord hört (über uiohook, wie das normale Discord) im Hintergrund auf
 * genau die Tasten, die in Discord unter "Tastenkürzel" bzw. "Push-to-Talk"
 * eingestellt sind, und gibt nur diese an Discord weiter. Ist kein Kürzel
 * eingestellt, läuft auch kein Hook.
 */

import { join } from "path";
import { STATIC_DIR } from "shared/paths";

import { sendRendererCommand } from "./ipcCommands";

interface HookEvent {
    type: number;
    keycode?: number;
    button?: number;
}

interface HookLib {
    start(handler: (e: HookEvent) => void): void;
    stop(): void;
}

const KEY_DOWN = 4;
const KEY_UP = 5;
const MOUSE_DOWN = 7;
const MOUSE_UP = 8;

// Discord-Kürzeltypen
const KEYBOARD_KEY = 0;
const MOUSE_BUTTON = 1;

// uiohook-Tastencode -> Windows-Tastencode (so speichert Discord seine Kürzel).
// Umkehrung der Tabelle aus libuiohook/src/windows/input_helper.c – uiohook leitet
// seine Codes unter Windows aus den Windows-Codes ab, dadurch stimmt das auch bei
// deutscher Tastatur (Y/Z, Umlaute).
// prettier-ignore
const VC_TO_VK: Record<number, number> = {
    0x1: 27, 0x2: 49, 0x3: 50, 0x4: 51, 0x5: 52, 0x6: 53, 0x7: 54, 0x8: 55, 0x9: 56, 0xA: 57,
    0xB: 48, 0xC: 189, 0xD: 187, 0xE: 8, 0xF: 9, 0x10: 81, 0x11: 87, 0x12: 69, 0x13: 82, 0x14: 84,
    0x15: 89, 0x16: 85, 0x17: 73, 0x18: 79, 0x19: 80, 0x1A: 219, 0x1B: 221, 0x1C: 13, 0x1D: 162,
    0x1E: 65, 0x1F: 83, 0x20: 68, 0x21: 70, 0x22: 71, 0x23: 72, 0x24: 74, 0x25: 75, 0x26: 76,
    0x27: 186, 0x28: 222, 0x29: 192, 0x2A: 160, 0x2B: 220, 0x2C: 90, 0x2D: 88, 0x2E: 67, 0x2F: 86,
    0x30: 66, 0x31: 78, 0x32: 77, 0x33: 188, 0x34: 190, 0x35: 191, 0x36: 161, 0x37: 106, 0x38: 164,
    0x39: 32, 0x3A: 20, 0x3B: 112, 0x3C: 113, 0x3D: 114, 0x3E: 115, 0x3F: 116, 0x40: 117,
    0x41: 118, 0x42: 119, 0x43: 120, 0x44: 121, 0x45: 144, 0x46: 145, 0x47: 103, 0x48: 104,
    0x49: 105, 0x4A: 109, 0x4B: 100, 0x4C: 101, 0x4D: 102, 0x4E: 107, 0x4F: 97, 0x50: 98, 0x51: 99,
    0x52: 96, 0x53: 110, 0x57: 122, 0x58: 123, 0x5B: 124, 0x5C: 125, 0x5D: 126, 0x63: 127,
    0x64: 128, 0x65: 129, 0x66: 130, 0x67: 131, 0x68: 132, 0x69: 133, 0x6A: 134, 0x6B: 135,
    0x70: 21, 0x79: 25, 0x7D: 223, 0xE1C: 13, 0xE1D: 163, 0xE35: 111, 0xE37: 44, 0xE38: 165,
    0xE45: 19, 0xE46: 226, 0xE47: 36, 0xE49: 33, 0xE4F: 35, 0xE51: 34, 0xE52: 45, 0xE53: 46,
    0xE5B: 91, 0xE5C: 92, 0xE5D: 93, 0xE010: 177, 0xE019: 176, 0xE020: 173, 0xE021: 183,
    0xE022: 179, 0xE024: 178, 0xE02E: 174, 0xE030: 175, 0xE032: 172, 0xE03C: 230, 0xE048: 38,
    0xE04B: 37, 0xE04C: 12, 0xE04D: 39, 0xE050: 40, 0xE05F: 95, 0xE064: 229, 0xE065: 170,
    0xE066: 171, 0xE067: 168, 0xE068: 169, 0xE069: 167, 0xE06A: 166, 0xE06C: 182, 0xE06D: 181,
    0xEE47: 36, 0xEE48: 38, 0xEE49: 33, 0xEE4B: 37, 0xEE4D: 39, 0xEE4F: 35, 0xEE50: 40, 0xEE51: 34,
    0xEE52: 45, 0xEE53: 46
};

// uiohook-Maustaste -> Discord (0 links, 1 rechts, 2 Mitte, 3 zurück, 4 vor)
const MOUSE_TO_DISCORD: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

let lib: HookLib | null | undefined;
let running = false;
let watched = new Set<string>();
const pressed = new Set<string>();

function loadLib() {
    if (lib !== undefined) return lib;
    try {
        lib = require(join(STATIC_DIR, `dist/uiohook-${process.platform}-${process.arch}.node`));
    } catch (e) {
        console.error("[Moon-Cord] Globale Tastenkürzel nicht verfügbar:", e);
        lib = null;
    }
    return lib;
}

function onInput(e: HookEvent) {
    let type: number, code: number | undefined, down: boolean;

    switch (e.type) {
        case KEY_DOWN:
        case KEY_UP:
            type = KEYBOARD_KEY;
            code = VC_TO_VK[e.keycode!];
            down = e.type === KEY_DOWN;
            break;
        case MOUSE_DOWN:
        case MOUSE_UP:
            type = MOUSE_BUTTON;
            code = MOUSE_TO_DISCORD[e.button!];
            down = e.type === MOUSE_DOWN;
            break;
        default:
            return; // Mausbewegungen usw.
    }

    if (code == null) return;
    const key = `${type}:${code}`;
    if (!watched.has(key)) return;

    // Gehaltene Tasten wiederholen "gedrückt" – nur Wechsel weitergeben
    if (down === pressed.has(key)) return;
    if (down) pressed.add(key);
    else pressed.delete(key);

    sendRendererCommand("moon:keybind", { type, code, down }).catch(() => {});
}

/** Welche Tasten Discord gerade als Kürzel nutzt ("typ:code") */
export function setWatchedKeybinds(keys: string[]) {
    watched = new Set(keys);
    for (const key of pressed) if (!watched.has(key)) pressed.delete(key);

    if (watched.size && !running) {
        const hook = loadLib();
        if (!hook) return;
        try {
            hook.start(onInput);
            running = true;
        } catch (e) {
            console.error("[Moon-Cord] Tastenkürzel-Hook konnte nicht starten:", e);
            lib = null;
        }
    } else if (!watched.size && running) {
        try {
            lib?.stop();
        } catch {}
        running = false;
        pressed.clear();
    }
}
