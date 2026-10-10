// Prüft, ob es neue Vencord-/Vesktop-Versionen gibt, und trägt sie in upstream.json ein.
//
// Beide Projekte werden auf ihrem neuesten main-Stand verfolgt:
//   Vencord: dort kommen Plugin-Reparaturen nach Discord-Updates zuerst an
//            (den Stand bekommen auch alle normalen Vencord-Nutzer)
//   Vesktop: dort kommen Electron-/Chromium-Sicherheitsupdates zuerst an
// Ob die neue Version taugt, entscheidet danach der Build: schlägt er fehl,
// wird nichts veröffentlicht.
//
// Gibt es etwas Neues, wird die Patch-Version in package.json erhöht (1.0.1 -> 1.0.2).
// Für GitHub Actions werden "changed", "version" und "summary" als Outputs geschrieben.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./paths.mjs";

const UPSTREAM_FILE = join(ROOT, "upstream.json");
const PACKAGE_FILE = join(ROOT, "package.json");

const lsRemote = (repo, ...refs) =>
    execFileSync("git", ["ls-remote", repo, ...refs], { encoding: "utf-8" })
        .trim().split("\n").filter(Boolean)
        .map(line => line.split("\t"));

function latestBranchCommit(repo, branch) {
    const [[sha] = []] = lsRemote(repo, `refs/heads/${branch}`);
    if (!sha) throw new Error(`${repo}: Branch ${branch} nicht gefunden`);
    return sha;
}

const upstream = JSON.parse(readFileSync(UPSTREAM_FILE, "utf-8"));
const changes = [];

const vencord = latestBranchCommit(upstream.vencord.repo, "main");
if (vencord !== upstream.vencord.commit) {
    changes.push(`Vencord ${upstream.vencord.commit.slice(0, 7)} → ${vencord.slice(0, 7)}`);
    upstream.vencord.commit = vencord;
}

const vesktop = latestBranchCommit(upstream.vesktop.repo, "main");
if (vesktop !== upstream.vesktop.commit) {
    changes.push(`Vesktop ${upstream.vesktop.commit.slice(0, 7)} → ${vesktop.slice(0, 7)}`);
    upstream.vesktop.commit = vesktop;
}

let version = JSON.parse(readFileSync(PACKAGE_FILE, "utf-8")).version;

if (changes.length) {
    writeFileSync(UPSTREAM_FILE, JSON.stringify(upstream, null, 4) + "\n");

    const [major, minor, patch] = version.split(".").map(Number);
    version = `${major}.${minor}.${patch + 1}`;
    const pkgText = readFileSync(PACKAGE_FILE, "utf-8");
    writeFileSync(PACKAGE_FILE, pkgText.replace(/"version": "[^"]+"/, `"version": "${version}"`));

    console.log(`Neue Upstream-Versionen → Moon-Cord ${version}\n  ${changes.join("\n  ")}`);
} else {
    console.log("Vencord und Vesktop sind aktuell.");
}

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
        `changed=${changes.length > 0}`,
        `version=${version}`,
        `summary=${changes.join("; ")}`
    ].join("\n") + "\n");
}
