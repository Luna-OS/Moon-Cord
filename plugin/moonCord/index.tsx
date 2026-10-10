/*
 * Moon-Cord – Moon-Theme für Discord
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { onceReady } from "@webpack";
import { ClientThemesBackgroundStore } from "@webpack/common";

import crescent from "file://assets/crescent.jpg?base64";
import horizon from "file://assets/horizon.jpg?base64";
import night from "file://assets/night.jpg?base64";
import stars from "file://assets/stars.jpg?base64";

import moonStyle from "./moon.css?managed";
import paletteStyle from "./palette.css?managed";

const logger = new Logger("MoonCord", "#8e7cff");

const WALLPAPERS: Record<string, string> = { night, crescent, horizon, stars };
const MOON_GRADIENT = "linear-gradient(180deg, #0c0a1a 0%, #1a1535 55%, #3a2f7a 100%)";

const settings = definePluginSettings({
    background: {
        type: OptionType.SELECT,
        description: "Hintergrund hinter Chat und Kanalliste",
        options: [
            { label: "Mondnacht", value: "night", default: true },
            { label: "Mondsichel", value: "crescent" },
            { label: "Horizont", value: "horizon" },
            { label: "Sternenhimmel", value: "stars" },
            { label: "Nur Moon-Verlauf", value: "gradient" },
            { label: "Eigenes Bild (URL unten)", value: "custom" },
            { label: "Kein Hintergrund, nur Moon-Farben", value: "none" }
        ],
        onChange: () => applyBackground()
    },
    customImage: {
        type: OptionType.STRING,
        description: "Bild-URL für „Eigenes Bild“ (z. B. von imgur oder GitHub)",
        default: "",
        onChange: () => applyBackground()
    },
    visibility: {
        type: OptionType.SLIDER,
        description: "Wie stark der Hintergrund durchscheint",
        markers: [0, 10, 20, 30, 35, 40, 50, 60, 70, 80, 90, 100],
        default: 35,
        stickToMarkers: false,
        onChange: () => applyBackground()
    },
    overrideNitro: {
        type: OptionType.BOOLEAN,
        description: "Nitro-Themes (Farbverläufe) immer durch das Moon-Theme ersetzen",
        default: true,
        onChange: () => {
            syncNitroOverride();
            updateClasses();
        }
    }
});

let wallpaperStyle: HTMLStyleElement | null = null;
const blobUrls = new Map<string, string>();
let classObserver: MutationObserver | null = null;
let running = false;

function wallpaperUrl(key: string) {
    let url = blobUrls.get(key);
    if (!url) {
        const bytes = Uint8Array.from(atob(WALLPAPERS[key]), c => c.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        blobUrls.set(key, url);
    }
    return url;
}

function backgroundImage(): string | null {
    const { background, customImage } = settings.store;

    if (background === "none") return null;
    if (background === "gradient") return MOON_GRADIENT;
    if (background === "custom") return customImage.trim() ? `url(${JSON.stringify(customImage.trim())})` : MOON_GRADIENT;
    return `url(${JSON.stringify(wallpaperUrl(WALLPAPERS[background] ? background : "night"))})`;
}

function applyBackground() {
    if (!running) return;

    const image = backgroundImage();
    const visibility = Math.min(Math.max(settings.store.visibility, 0), 100) / 100;

    wallpaperStyle ??= document.createElement("style");
    wallpaperStyle.id = "moon-cord-wallpaper";
    wallpaperStyle.textContent = image
        ? `html.moon-cord-bg { --custom-theme-background: ${image} !important; --moon-bg-visibility: ${visibility}; }`
        : "";
    if (!wallpaperStyle.isConnected) document.head.append(wallpaperStyle);

    updateClasses();
}

// Hat Discord gerade ein eigenes Nitro-Theme aktiv, das angezeigt werden soll?
// Nur möglich, wenn "Nitro-Themes ersetzen" ausgeschaltet ist.
function showsDiscordNitroTheme() {
    if (settings.store.overrideNitro) return false;
    try {
        return ClientThemesBackgroundStore?.gradientPreset != null;
    } catch {
        return false;
    }
}

const wantsBackground = () => running && settings.store.background !== "none" && !showsDiscordNitroTheme();

let addedThemeClass = false;

function updateClasses() {
    const root = document.documentElement;
    const background = wantsBackground();

    root.classList.toggle("moon-cord", running);
    root.classList.toggle("moon-cord-bg", background);

    // Discord hängt seine Nitro-Hintergrund-Regeln an diese Klasse.
    // Wir setzen sie selbst und füllen sie mit Moon-Werten.
    if (background) {
        root.classList.add("custom-theme-background");
        addedThemeClass = true;
    } else if (addedThemeClass) {
        addedThemeClass = false;
        if (!showsDiscordNitroTheme()) root.classList.remove("custom-theme-background");
    }
}

// Discord setzt die Klassen am <html> bei Theme-Wechseln neu – dann wieder anbringen.
function watchClasses() {
    classObserver?.disconnect();
    classObserver = new MutationObserver(() => {
        const { classList } = document.documentElement;
        const background = wantsBackground();
        const outdated = classList.contains("moon-cord") !== running
            || classList.contains("moon-cord-bg") !== background
            || (background && !classList.contains("custom-theme-background"));
        if (outdated) updateClasses();
    });
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

// ---------- Nitro-Theme-Store ----------
// Solange Moon Nitro überschreibt, meldet Discords Theme-Store "kein Nitro-Theme".
// So legt Discord seinen Farbverlauf gar nicht erst an; das CSS fängt den Rest ab.

const OVERRIDDEN_STORE_KEYS = ["gradientPreset", "isPreview", "getLinearGradient"] as const;
let storeOverridden = false;

function onThemeStoreChange() {
    updateClasses();
}

function overrideNitroStore() {
    const store = ClientThemesBackgroundStore as any;
    if (!store || storeOverridden) return;

    try {
        Object.defineProperty(store, "gradientPreset", { configurable: true, get: () => undefined });
        Object.defineProperty(store, "isPreview", { configurable: true, get: () => false });
        Object.defineProperty(store, "getLinearGradient", { configurable: true, writable: true, value: () => null });
        storeOverridden = true;
        store.emitChange?.();
    } catch (e) {
        logger.error("Konnte Nitro-Theme-Store nicht überschreiben", e);
    }
}

function restoreNitroStore() {
    const store = ClientThemesBackgroundStore as any;
    if (!store || !storeOverridden) return;

    for (const key of OVERRIDDEN_STORE_KEYS) delete store[key];
    storeOverridden = false;
    store.emitChange?.();
}

function syncNitroOverride() {
    if (running && settings.store.overrideNitro) overrideNitroStore();
    else restoreNitroStore();
}

export default definePlugin({
    name: "MoonCord",
    description: "Das Moon-Theme von Moon-Cord: Nachtblau + Lila, Moon-Hintergründe, und Nitro-Themes werden durch Moon ersetzt.",
    tags: ["Appearance", "Customisation"],
    authors: [{ name: "Luna", id: 0n }],
    required: true,
    settings,
    startAt: StartAt.Init,

    start() {
        running = true;
        enableStyle(paletteStyle);
        enableStyle(moonStyle);

        if (document.head) applyBackground();
        else document.addEventListener("DOMContentLoaded", applyBackground, { once: true });

        updateClasses();
        watchClasses();

        onceReady.then(() => {
            if (!running) return;
            ClientThemesBackgroundStore?.addChangeListener(onThemeStoreChange);
            syncNitroOverride();
            updateClasses();
        });
    },

    stop() {
        running = false;
        classObserver?.disconnect();
        classObserver = null;

        ClientThemesBackgroundStore?.removeChangeListener(onThemeStoreChange);
        restoreNitroStore();

        wallpaperStyle?.remove();
        wallpaperStyle = null;
        for (const url of blobUrls.values()) URL.revokeObjectURL(url);
        blobUrls.clear();

        disableStyle(moonStyle);
        disableStyle(paletteStyle);
        updateClasses();
    }
});
