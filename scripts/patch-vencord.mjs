// Macht Vencords eingebauten Updater (Einstellungen → Updater) für Moon-Cord zuverlässig.
//
// Jede Ersetzung prüft, dass ihr Suchtext wirklich gefunden wurde. Ändert Vencord
// eine dieser Stellen, bricht der Build mit einer klaren Meldung ab.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VENCORD_DIR } from "./paths.mjs";

const read = file => readFileSync(join(VENCORD_DIR, file), "utf-8").replace(/\r\n/g, "\n");
const write = (file, content) => writeFileSync(join(VENCORD_DIR, file), content);

function replace(file, search, replacement) {
    const content = read(file);
    if (!content.includes(search)) throw new Error(`patch-vencord: "${search}" nicht in ${file} gefunden`);
    write(file, content.replace(search, replacement));
}

// ---------- Downloads über Chromium statt Node ----------
// Node prüft Zertifikate mit einer eigenen Liste und kennt weder den Windows-
// Zertifikatsspeicher noch den System-Proxy. Prüft ein Virenscanner (Avast,
// Kaspersky, ESET, …) oder ein Firmen-/Schulnetz HTTPS-Verbindungen, schlägt jedes
// Update mit "self signed certificate in certificate chain" fehl – obwohl Discord
// selbst läuft. Electrons net.fetch nutzt denselben Netzwerk-Stack wie Discord.

replace("src/main/utils/http.ts",
    "        var res = await fetch(url, options);",
    "        var res = await net.fetch(String(url), options);");
replace("src/main/utils/http.ts",
    'import { createWriteStream } from "original-fs";',
    'import { net } from "electron";\nimport { createWriteStream } from "original-fs";');

// ---------- Updater robuster ----------
// - Jede Prüfung beginnt mit einer leeren Download-Liste (vorher wurde jede Datei
//   bei "Nach Updates suchen" + "Jetzt aktualisieren" doppelt geladen und gleichzeitig
//   zweimal geschrieben).
// - Die Änderungsliste (GitHub "compare") ist nur Beiwerk: klappt sie nicht, wird
//   trotzdem aktualisiert.

replace("src/main/updater/http.ts",
    `async function fetchUpdates() {
    const data = await githubGet("/releases/latest");
`,
    `let latestRelease = "";

async function fetchUpdates() {
    PendingUpdates = [];
    const data = await githubGet("/releases/latest");
    latestRelease = data.name;
`);
replace("src/main/updater/http.ts",
    "    const data = await githubGet(`/compare/${gitHash}...HEAD`);\n",
    `    const data = await githubGet(\`/compare/\${gitHash}...HEAD\`).catch(() => null);
    if (!data?.commits?.length) {
        return [{
            hash: latestRelease.slice(latestRelease.lastIndexOf(" ") + 1),
            author: "Moon-Cord",
            message: latestRelease
        }];
    }
`);

// ---------- Echte Fehlermeldung statt "An unknown error occurred" ----------

replace("src/components/settings/tabs/updater/runWithDispatch.tsx",
    `    if (!e?.code || !e.cmd)
        return "An unknown error occurred.\\nPlease try again or see the console for more info.";`,
    `    if (!e?.code || !e.cmd) {
        const message = String(e?.message ?? "").split("\\n")[0].slice(0, 300);
        return message
            ? \`Das Update ist fehlgeschlagen:\\n\\\`\${message}\\\`\`
            : "An unknown error occurred.\\nPlease try again or see the console for more info.";
    }`);

console.log("Vencord-Updater für Moon-Cord angepasst");
