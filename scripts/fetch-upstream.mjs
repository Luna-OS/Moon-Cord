// Holt Vencord und Vesktop in genau den Versionen aus upstream.json nach .upstream/.
// Bereits vorhandene Checkouts werden auf den gepinnten Commit zurückgesetzt.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT, UPSTREAM_DIR } from "./paths.mjs";

const upstream = JSON.parse(readFileSync(join(ROOT, "upstream.json"), "utf-8"));

function git(cwd, ...args) {
    execFileSync("git", args, { cwd, stdio: "inherit" });
}

mkdirSync(UPSTREAM_DIR, { recursive: true });

for (const [name, { repo, commit }] of Object.entries(upstream)) {
    const dir = join(UPSTREAM_DIR, name);
    console.log(`\n» ${name} @ ${commit.slice(0, 10)}`);

    if (!existsSync(join(dir, ".git"))) {
        mkdirSync(dir, { recursive: true });
        git(dir, "init", "-q");
        git(dir, "remote", "add", "origin", repo);
    }

    git(dir, "fetch", "-q", "--depth", "1", "origin", commit);
    git(dir, "checkout", "-q", "--force", "FETCH_HEAD");
    git(dir, "clean", "-q", "-fdx", "-e", "node_modules");
}
