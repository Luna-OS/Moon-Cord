// Erzeugt plugin/moonCord/palette.css aus Discords aktueller Farbpalette.
//
// Discord baut fast alle Farben (Hintergründe, Text, Rahmen, Buttons) aus
// Grund-Paletten wie --neutral-69-hsl oder --brand-500-hsl zusammen. Wir
// lesen diese Paletten aus Discords CSS und färben jede Stufe in die
// Moon-Farben (Nachtblau + Lila) um. Dadurch wird automatisch die ganze
// App umgefärbt, auch Stellen, die wir nie einzeln angefasst haben.
//
// Aufruf:
//   node scripts/generate-palette.mjs              lädt das CSS von discord.com
//   node scripts/generate-palette.mjs a.css b.css  nutzt lokale CSS-Dateien

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./paths.mjs";

const OUT_FILE = join(ROOT, "plugin/moonCord/palette.css");
const MOON_HUE = 250;

// Graustufen: Discord-Helligkeit -> Moon-Helligkeit.
// Abgestimmt auf Discords Standard-Design "Dunkel" (.theme-darker): dort landen
// Rahmen, Kanalliste, Chat und Popups genau auf #0C0A1A, #130F28, #1A1535 und
// #211A44. Grauer Text wird etwas heller, wie #ABA3D6 im Moon-Theme.
const LIGHTNESS_MAP = [
    [0, 2.5], [3.14, 4.5], [7.45, 7], [10.98, 11], [15.1, 15], [18.43, 18.4], [26.5, 26],
    [45.9, 47], [60.4, 67], [74.1, 77], [86.9, 88], [95.5, 96], [100, 100]
];

// Sättigung je nach Moon-Helligkeit, abgelesen aus den Moon-Farben:
// #0C0A1A #130F28 #1A1535 #211A44 #2E2656 #3A3168 #5A5285 #9A90C8 #ABA3D6 #D0C8F5 #EEEAFF
const SATURATION_MAP = [
    [0, 40], [7, 44], [11, 46], [15, 43], [18, 45], [24, 39], [30, 36], [42, 26],
    [63, 32], [74, 37], [87, 62], [95.5, 92], [100, 100]
];

const NEUTRAL_FAMILIES = ["neutral", "primary", "plum"];
const ACCENT_FAMILIES = ["brand", "blurple"];

function lerp(map, x) {
    if (x <= map[0][0]) return map[0][1];
    for (let i = 1; i < map.length; i++) {
        const [x1, y1] = map[i];
        if (x <= x1) {
            const [x0, y0] = map[i - 1];
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
    }
    return map.at(-1)[1];
}

const round = n => Math.round(n * 100) / 100;

async function loadDiscordCss() {
    const files = process.argv.slice(2);
    if (files.length) return files.map(f => readFileSync(f, "utf-8")).join("\n");

    const html = await fetch("https://discord.com/login").then(r => r.text());
    const hrefs = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map(m => m[1]);
    if (!hrefs.length) throw new Error("Keine Stylesheets auf discord.com/login gefunden");

    const sheets = await Promise.all(hrefs.map(h => fetch("https://discord.com" + h).then(r => r.text())));
    return sheets.join("\n");
}

function parsePalette(css) {
    // name -> { family, step, h, s, l }
    const palette = new Map();
    const families = [...NEUTRAL_FAMILIES, ...ACCENT_FAMILIES].join("|");
    const re = new RegExp(String.raw`--(${families})-(\d+)-hsl:\s*([\d.]+)\s+calc\(var\(--saturation-factor,\s*1\)\s*\*\s*([\d.]+)%\)\s+([\d.]+)%`, "g");

    for (const [, family, step, h, s, l] of css.matchAll(re)) {
        palette.set(`--${family}-${step}-hsl`, { family, step: +step, h: +h, s: +s, l: +l });
    }
    return palette;
}

function moonColor({ family, s, l }) {
    if (NEUTRAL_FAMILIES.includes(family)) {
        const ml = lerp(LIGHTNESS_MAP, l);
        return [MOON_HUE, lerp(SATURATION_MAP, ml), ml];
    }
    // Akzentfarben (Buttons, Links, Auswahl): Discords Blurple wird Moon-Lila.
    // Helligkeit bleibt, damit weißer Text auf Buttons lesbar bleibt.
    return [MOON_HUE - 1, Math.max(s, 70), l];
}

const css = await loadDiscordCss();
const palette = parsePalette(css);
if (palette.size < 200) throw new Error(`Nur ${palette.size} Paletten-Farben gefunden, Discord hat sein CSS wohl umgebaut`);

const lines = [...palette.entries()]
    .sort(([, a], [, b]) => a.family.localeCompare(b.family) || a.step - b.step)
    .map(([name, entry]) => {
        const [h, s, l] = moonColor(entry).map(round);
        return `    ${name}: ${h} calc(var(--saturation-factor, 1)*${s}%) ${l}%;`;
    });

writeFileSync(OUT_FILE, `/*
 * Moon-Cord – Discords Grundpaletten in Moon-Farben.
 * Automatisch erzeugt von scripts/generate-palette.mjs – nicht von Hand bearbeiten.
 */

html.moon-cord {
${lines.join("\n")}
}
`);

console.log(`${palette.size} Farben nach ${OUT_FILE} geschrieben`);
