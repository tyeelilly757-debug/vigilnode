/**
 * Runs repo-root `npm run run:clients` before Vite build so `client/public/ai/` exists in CI.
 * Skip with SKIP_AI_PAGE_GENERATE=1 (use only if `client/public/ai/*.html` is already committed).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, "..");
const repoRoot = path.join(clientRoot, "..");
const rootPkg = path.join(repoRoot, "package.json");

if (process.env.SKIP_AI_PAGE_GENERATE === "1") {
  console.log("[client build] SKIP_AI_PAGE_GENERATE=1 — skipping AI page generation");
  process.exit(0);
}

if (!fs.existsSync(rootPkg)) {
  console.error("[client build] Monorepo root not found (expected package.json one level above client/).");
  process.exit(1);
}

const r = spawnSync("npm run run:clients", {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (r.status !== 0 && r.status !== null) {
  process.exit(r.status);
}
if (r.error) {
  console.error(r.error);
  process.exit(1);
}
