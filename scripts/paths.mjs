import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const UPSTREAM_DIR = join(ROOT, ".upstream");
export const VENCORD_DIR = join(UPSTREAM_DIR, "vencord");
export const VESKTOP_DIR = join(UPSTREAM_DIR, "vesktop");
export const DIST_DIR = join(ROOT, "dist");
