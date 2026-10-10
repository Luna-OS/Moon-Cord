// Baut Moon-Cord komplett:
//   1. Vencord (mit allen Plugins + Moon-Plugin) bauen
//   2. Vesktop zu Moon-Cord umbauen und das Moon-Vencord hineinlegen
//   3. Mit electron-builder Installer/Pakete erzeugen
//
// Aufruf:
//   node scripts/build.mjs                 nur bauen, ohne Installer (schnell, zum Testen)
//   node scripts/build.mjs --dist --win    Windows-Installer + ZIP nach dist/
//   node scripts/build.mjs --dist --linux  AppImage, .deb und .tar.gz nach dist/
//   node scripts/build.mjs --dist --dir    entpackte App nach dist/ (zum Ausprobieren)

import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIST_DIR, ROOT, VENCORD_DIR, VESKTOP_DIR } from "./paths.mjs";

const args = process.argv.slice(2);
const wantsDist = args.includes("--dist");
const builderTargets = args.filter(a => ["--win", "--linux", "--dir"].includes(a));

const REPO = "Luna-OS/Moon-Cord";
const VENCORD_FILES = ["vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css"];

const isWindows = process.platform === "win32";

function run(cwd, command, commandArgs, env = {}) {
    console.log(`\n$ ${command} ${commandArgs.join(" ")}   (${cwd.replace(ROOT, ".")})`);
    execFileSync(command, commandArgs, {
        cwd,
        stdio: "inherit",
        // pnpm ist unter Windows ein .cmd-Skript und braucht eine Shell
        shell: isWindows && command === "pnpm",
        env: { ...process.env, ...env }
    });
}

function moonHash() {
    if (process.env.MOON_CORD_HASH) return process.env.MOON_CORD_HASH;
    try {
        return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
    } catch {
        return "dev";
    }
}

if (!existsSync(join(VENCORD_DIR, "package.json")) || !existsSync(join(VESKTOP_DIR, "package.json")) || args.includes("--fetch")) {
    run(ROOT, process.execPath, ["scripts/fetch-upstream.mjs"]);
}

const hash = moonHash();
console.log(`\n» Moon-Cord ${hash}`);

// ---------- 1. Vencord + Moon-Plugin ----------

const pluginTarget = join(VENCORD_DIR, "src/plugins/moonCord");
rmSync(pluginTarget, { recursive: true, force: true });
cpSync(join(ROOT, "plugin/moonCord"), pluginTarget, { recursive: true });

run(VENCORD_DIR, "pnpm", ["install", "--frozen-lockfile"]);
run(VENCORD_DIR, "pnpm", ["build", "--standalone"], {
    // Vencords Updater schaut damit in die Moon-Cord-Releases statt zu Vendicated
    VENCORD_REMOTE: REPO,
    VENCORD_HASH: hash
});

// ---------- 2. Vesktop -> Moon-Cord ----------
// Vesktop wird vor dem Umbau zurückgesetzt, damit mehrfaches Bauen nicht doppelt patcht.

run(VESKTOP_DIR, "git", ["checkout", "-q", "--force", "HEAD"]);
run(VESKTOP_DIR, "git", ["clean", "-q", "-fd", "-e", "node_modules", "-e", "dist"]);
run(ROOT, process.execPath, ["scripts/patch-vesktop.mjs"]);

const bundleDir = join(VESKTOP_DIR, "moon-vencord");
rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });
for (const file of VENCORD_FILES) cpSync(join(VENCORD_DIR, "dist", file), join(bundleDir, file));
writeFileSync(join(bundleDir, "package.json"), "{}");
writeFileSync(join(bundleDir, "moon-cord-bundle.txt"), hash);

run(VESKTOP_DIR, "pnpm", ["install", "--frozen-lockfile"]);
run(VESKTOP_DIR, "pnpm", ["build"]);

if (!wantsDist) {
    console.log("\n✔ Moon-Cord gebaut. Starten mit: pnpm start");
    process.exit(0);
}

// ---------- 3. Installer / Pakete ----------

run(VESKTOP_DIR, "pnpm", ["exec", "electron-builder", "--publish", "never", ...builderTargets]);

mkdirSync(DIST_DIR, { recursive: true });
const builderOut = join(VESKTOP_DIR, "dist");
for (const entry of readdirSync(builderOut)) {
    const isPackage = /\.(exe|zip|AppImage|deb|tar\.gz|yml|blockmap)$/.test(entry) || entry.endsWith("-unpacked");
    if (isPackage && entry !== "builder-debug.yml") cpSync(join(builderOut, entry), join(DIST_DIR, entry), { recursive: true });
}
// Vencord-Dateien für Vencords eingebauten Updater (lädt sie aus dem Release)
for (const file of VENCORD_FILES) cpSync(join(VENCORD_DIR, "dist", file), join(DIST_DIR, file));

console.log(`\n✔ Fertig – Dateien in ${DIST_DIR}`);
