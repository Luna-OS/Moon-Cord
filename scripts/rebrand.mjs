// Benennt sichtbare Texte von "Vencord" in "Moon-Cord" um.
//
// Geändert werden nur Texte, die man in der App sieht: Strings, Template-Strings
// und JSX-Text. Code wie Vencord.Api.Commands, Pfade wie "Vencord/…", Links wie
// github.com/Vendicated/Vencord und Wörter wie VencordNative bleiben unverändert,
// sonst würde die App kaputtgehen.
//
// Aufruf: node scripts/rebrand.mjs <projektordner> <unterordner…> [--skip datei…]
// Der Projektordner muss installierte node_modules (mit typescript) haben.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const skipIndex = args.indexOf("--skip");
const [projectArg, ...dirs] = skipIndex === -1 ? args : args.slice(0, skipIndex);
const projectDir = resolve(projectArg);
const skip = new Set(skipIndex === -1 ? [] : args.slice(skipIndex + 1));

const ts = createRequire(join(projectDir, "package.json"))("typescript");

// "Vencord" als eigenes Wort – nicht als Teil von Pfaden, Links oder Code (Vencord.Api …)
const WORD = /(?<![\w$/.-])Vencord(?![\w$/-]|\.[\w$[])/g;
const LITERALS = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.TemplateHead,
    ts.SyntaxKind.TemplateMiddle,
    ts.SyntaxKind.TemplateTail,
    ts.SyntaxKind.JsxText
]);

function isCodeReference(node) {
    const { parent } = node;
    // import "…", require("…"), Objekt-Schlüssel { "Vencord": … }
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
    if (ts.isCallExpression(parent) && parent.expression.getText() === "require") return true;
    if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return true;
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
    return false;
}

function rebrandFile(file) {
    const source = readFileSync(file, "utf-8");
    if (!source.includes("Vencord")) return 0;

    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    const edits = [];

    (function visit(node) {
        if (LITERALS.has(node.kind) && !isCodeReference(node)) {
            const start = node.getStart(sf);
            const text = source.slice(start, node.end);
            const renamed = text.replace(WORD, "Moon-Cord");
            if (renamed !== text) edits.push([start, node.end, renamed]);
        }
        ts.forEachChild(node, visit);
    })(sf);

    if (!edits.length) return 0;

    let output = source;
    for (const [start, end, text] of edits.reverse()) output = output.slice(0, start) + text + output.slice(end);
    writeFileSync(file, output);
    return edits.length;
}

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (/\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) yield path;
    }
}

let total = 0;
for (const dir of dirs) {
    for (const file of walk(join(projectDir, dir))) {
        const rel = relative(projectDir, file).replaceAll("\\", "/");
        if ([...skip].some(s => rel === s || rel.startsWith(s + "/"))) continue;
        total += rebrandFile(file);
    }
}

if (total < 10) throw new Error(`rebrand: nur ${total} Texte umbenannt – stimmt der Ordner?`);
console.log(`${total} Texte von Vencord auf Moon-Cord umbenannt (${dirs.join(", ")})`);
