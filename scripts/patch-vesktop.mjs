// Macht aus dem Vesktop-Checkout in .upstream/vesktop den Moon-Cord-Client:
// Name, Icons, Moon-Farben, eingebautes Moon-Vencord und Updates aus Luna-OS/Moon-Cord.
//
// Jede Ersetzung prüft, dass ihr Suchtext wirklich gefunden wurde. Ändert Vesktop
// eine dieser Stellen, bricht der Build mit einer klaren Meldung ab, statt
// stillschweigend einen halb umgebauten Client zu bauen.

import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { ROOT, VESKTOP_DIR } from "./paths.mjs";

const ASSETS = join(ROOT, "desktop/assets");
const REPO = "Luna-OS/Moon-Cord";
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

// Unter Windows kann Git Dateien mit CRLF auschecken – wir arbeiten immer mit LF
const read = file => readFileSync(join(VESKTOP_DIR, file), "utf-8").replace(/\r\n/g, "\n");
const write = (file, content) => writeFileSync(join(VESKTOP_DIR, file), content);

function replace(file, search, replacement, { all = false } = {}) {
    const content = read(file);
    if (!content.includes(search)) throw new Error(`patch-vesktop: "${search}" nicht in ${file} gefunden`);
    write(file, all ? content.replaceAll(search, replacement) : content.replace(search, replacement));
}

// ---------- package.json / electron-builder ----------

const vpkg = JSON.parse(read("package.json"));
Object.assign(vpkg, {
    name: "moon-cord",
    version: pkg.version,
    description: "Moon-Cord – Discord im Moon-Design, mit allen Vencord-Plugins",
    homepage: `https://github.com/${REPO}`,
    author: "Luna <luna@luna-os.dev>"
});

const build = vpkg.build;
Object.assign(build, {
    appId: "dev.luna-os.moon-cord",
    productName: "Moon-Cord",
    executableName: "moon-cord",
    publish: { provider: "github", owner: "Luna-OS", repo: "Moon-Cord", releaseType: "release" },
    extraResources: [{ from: "moon-vencord", to: "moon-vencord" }]
});
build.linux.icon = "build/icon.png";
build.linux.maintainer = "Luna <luna@luna-os.dev>";
build.linux.target = [
    { target: "AppImage", arch: ["x64"] },
    { target: "deb", arch: ["x64"] },
    { target: "tar.gz", arch: ["x64"] }
];
Object.assign(build.linux.desktop.entry, {
    Name: "Moon-Cord",
    Keywords: "discord;vencord;moon;chat;",
    StartupWMClass: "moon-cord"
});
build.win.icon = "build/icon.png";
build.win.target = [
    { target: "nsis", arch: ["x64"] },
    { target: "zip", arch: ["x64"] }
];
build.nsis.artifactName = "Moon-Cord-Setup-${version}.${ext}";
build.nsis.shortcutName = "Moon-Cord";
// macOS bräuchte Apple-Signatur und Notarisierung – wird nicht gebaut
delete build.mac;
delete build.dmg;

write("package.json", JSON.stringify(vpkg, null, 4) + "\n");

replace("build/installer.nsh", "vesktop", "moon-cord", { all: true });

// ---------- Icons, Tray, Ladebildschirm ----------

copyFileSync(join(ASSETS, "icon.png"), join(VESKTOP_DIR, "build/icon.png"));
copyFileSync(join(ASSETS, "tray.png"), join(VESKTOP_DIR, "static/tray/tray.png"));
copyFileSync(join(ASSETS, "tray.png"), join(VESKTOP_DIR, "static/tray.png"));
copyFileSync(join(ASSETS, "tray-unread.png"), join(VESKTOP_DIR, "static/tray/trayUnread.png"));
copyFileSync(join(ASSETS, "splash.webp"), join(VESKTOP_DIR, "static/splash.webp"));
copyFileSync(join(ROOT, "desktop/views/about.html"), join(VESKTOP_DIR, "static/views/about.html"));

// Fenster, Ladebildschirm und Einrichtung in Moon-Farben
write("static/views/common.css", read("static/views/common.css").replace(/:root \{[^}]*\}/, `:root {
    color-scheme: dark;

    --bg: #130f28;
    --fg: #eeeaff;
    --fg-secondary: #aba3d6;
    --fg-semi-trans: rgb(184 171 255 / 0.35);
    --link: #b8abff;
    --link-hover: #d4cbff;
}`));
replace("static/views/first-launch.html", "background: green;", "background: #8e7cff;");
replace("static/views/first-launch.html", "background: red;", "background: #3a3168;");

// ---------- Name "Vesktop" -> "Moon-Cord" in allen sichtbaren Texten ----------

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (/\.(tsx?|html)$/.test(entry)) yield path;
    }
}

let renamed = 0;
for (const dir of ["src/main", "src/renderer", "static/views"]) {
    for (const path of walk(join(VESKTOP_DIR, dir))) {
        const lines = readFileSync(path, "utf-8").replace(/\r\n/g, "\n").split("\n");
        const out = lines.map(line => {
            const isComment = /^\s*(\*|\/\/|\/\*)/.test(line);
            // interner Patch-Name, kein sichtbarer Text
            if (isComment || line.includes('addPatch(patch, "Vesktop"')) return line;
            // Links wie github.com/Vencord/Vesktop bleiben unverändert
            return line.replace(/(?<![/\w.-])Vesktop\b/g, () => (renamed++, "Moon-Cord"));
        });
        writeFileSync(path, out.join("\n"));
    }
}
if (renamed < 20) throw new Error(`patch-vesktop: nur ${renamed} Vesktop-Texte umbenannt, Vesktop hat sich wohl stark geändert`);
console.log(`${renamed} Texte auf Moon-Cord umbenannt`);

replace("src/main/constants.ts",
    "export const USER_AGENT = `Moon-Cord/${app.getVersion()} (https://github.com/Vencord/Vesktop)`;",
    `export const USER_AGENT = \`Moon-Cord/\${app.getVersion()} (https://github.com/${REPO})\`;`);
replace("src/renderer/logger.ts", '"#d3869b"', '"#8e7cff"');

// ---------- Moon-Vencord ist eingebaut ----------
// Vesktop lädt Vencord sonst beim ersten Start von Vendicated/Vencord herunter.
// Moon-Cord bringt seinen eigenen Build mit (resources/moon-vencord) und kopiert
// ihn in den Datenordner, sobald eine neue Moon-Cord-Version installiert wurde.
// Vencords eingebauter Updater holt Zwischen-Updates aus den Moon-Cord-Releases.

replace("src/main/utils/vencordLoader.ts",
    '"/repos/Vendicated/Vencord/releases/latest"',
    `"/repos/${REPO}/releases/latest"`);

replace("src/main/utils/vencordLoader.ts",
    `export async function ensureVencordFiles() {
    if (await isValidVencordInstall(VENCORD_FILES_DIR)) return;

    mkdirSync(VENCORD_FILES_DIR, { recursive: true });
`,
    `const BUNDLED_VENCORD_DIR = app.isPackaged
    ? join(process.resourcesPath, "moon-vencord")
    : join(__dirname, "../../moon-vencord");
const BUNDLED_MARKER = "moon-cord-bundle.txt";

async function copyBundledVencord() {
    if (State.store.vencordDir || !(await isValidVencordInstall(BUNDLED_VENCORD_DIR))) return false;

    const bundled = await readFile(join(BUNDLED_VENCORD_DIR, BUNDLED_MARKER), "utf-8").catch(() => "");
    const installed = await readFile(join(VENCORD_FILES_DIR, BUNDLED_MARKER), "utf-8").catch(() => null);
    if (bundled === installed && (await isValidVencordInstall(VENCORD_FILES_DIR))) return true;

    mkdirSync(VENCORD_FILES_DIR, { recursive: true });
    await cp(BUNDLED_VENCORD_DIR, VENCORD_FILES_DIR, { recursive: true, force: true });
    return true;
}

export async function ensureVencordFiles() {
    if (await copyBundledVencord()) return;
    if (await isValidVencordInstall(VENCORD_FILES_DIR)) return;

    mkdirSync(VENCORD_FILES_DIR, { recursive: true });
`);
replace("src/main/utils/vencordLoader.ts",
    'import { access, constants as FsConstants, writeFile } from "fs/promises";',
    'import { app } from "electron";\nimport { access, constants as FsConstants, cp, readFile, writeFile } from "fs/promises";\nimport { State } from "main/settings";');

// ---------- Moon-Standardeinstellungen für Vencord ----------
// Beim allerersten Start: Moon-Theme an und eine Auswahl beliebter Plugins aktiv.

copyFileSync(join(ROOT, "desktop/defaults/vencord-settings.json"), join(VESKTOP_DIR, "src/main/moonVencordDefaults.json"));
replace("src/main/constants.ts",
    'export const VENCORD_SETTINGS_FILE = join(VENCORD_SETTINGS_DIR, "settings.json");',
    `export const VENCORD_SETTINGS_FILE = join(VENCORD_SETTINGS_DIR, "settings.json");
if (!existsSync(VENCORD_SETTINGS_FILE)) {
    writeFileSync(VENCORD_SETTINGS_FILE, JSON.stringify(require("./moonVencordDefaults.json"), null, 4));
}`);
replace("src/main/constants.ts",
    'import { existsSync, mkdirSync } from "fs";',
    'import { existsSync, mkdirSync, writeFileSync } from "fs";');

console.log(`Vesktop in ${relative(ROOT, VESKTOP_DIR)} zu Moon-Cord ${pkg.version} umgebaut`);
