// Baut "Moon-Cord für Discord": einen Installer, der Moon-Cord (Moon-Theme + alle
// Vencord-Plugins) in das offizielle Discord einklinkt.
//
// Voraussetzung: Vencord ist schon gebaut (scripts/build.mjs) und Go ist installiert.
// Ergebnis in dist/: Moon-Cord-Discord-Installer.exe (Windows), moon-cord-discord-installer-linux
// sowie patcher.js/preload.js/renderer.js/renderer.css für Vencords Updater im echten Discord.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIST_DIR, ROOT, VENCORD_DIR } from "./paths.mjs";

const INSTALLER_DIR = join(ROOT, "installer");
const FILES_DIR = join(INSTALLER_DIR, "files");
const DISCORD_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const hash = process.env.MOON_CORD_HASH
    || execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: ROOT, encoding: "utf-8" }).trim();

mkdirSync(FILES_DIR, { recursive: true });
mkdirSync(DIST_DIR, { recursive: true });

for (const file of DISCORD_FILES) {
    copyFileSync(join(VENCORD_DIR, "dist", file), join(FILES_DIR, file));
    copyFileSync(join(VENCORD_DIR, "dist", file), join(DIST_DIR, file));
}
copyFileSync(join(ROOT, "desktop/defaults/vencord-settings.json"), join(FILES_DIR, "settings.json"));
writeFileSync(join(FILES_DIR, "version.txt"), `v${pkg.version} (${hash})\n`);

const targets = [
    { goos: "windows", out: "Moon-Cord-Discord-Installer.exe" },
    { goos: "linux", out: "moon-cord-discord-installer-linux" }
];

for (const { goos, out } of targets) {
    execFileSync("go", ["build", "-trimpath", "-ldflags", "-s -w", "-o", join(DIST_DIR, out), "."], {
        cwd: INSTALLER_DIR,
        stdio: "inherit",
        env: { ...process.env, GOOS: goos, GOARCH: "amd64", CGO_ENABLED: "0" }
    });
    console.log(`✔ ${out}`);
}
