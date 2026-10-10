// Rendert die Moon-Cord-Icons aus desktop/assets/*.svg zu PNG/WebP.
// Braucht Playwright (npm i -g playwright) und Python mit Pillow für die WebP-Datei.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { ROOT } from "./paths.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const ASSETS = join(ROOT, "desktop/assets");

const targets = [
    ["icon.svg", "icon.png", 1024],
    ["icon.svg", "icon-256.png", 256],
    ["tray.svg", "tray.png", 64],
    ["tray-unread.svg", "tray-unread.png", 64]
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [svg, png, size] of targets) {
    await page.setViewportSize({ width: size, height: size });
    const markup = readFileSync(join(ASSETS, svg), "utf-8").replace("<svg ", `<svg width="${size}" height="${size}" `);
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${markup}`);
    await page.screenshot({ path: join(ASSETS, png), omitBackground: true });
    console.log(`${png} (${size}px)`);
}

await browser.close();

execFileSync("python3", ["-c", `
from PIL import Image
Image.open("${join(ASSETS, "icon-256.png")}").save("${join(ASSETS, "splash.webp")}", lossless=True)
`], { stdio: "inherit" });
console.log("splash.webp");
