/**
 * Package the built MCP server into the plugin itself.
 *
 * The bundle is installed on its own — `npm publish` + `dsh plugin add`, or a
 * local `dsh plugin add <path>` — and `cordis.patch.yml` starts
 * `<package>/server/index.js`. Carrying the server is what makes the plugin
 * self-contained: no checkout, no build step, and no hard-coded paths on the
 * installing machine.
 *
 * Runs from the repository root (or via the plugin's `prepack` hook, which npm
 * invokes before publishing), so `npm run build` has to have produced `dist/`.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "..");
const repoRoot = path.resolve(pluginDir, "..");
const built = path.join(repoRoot, "dist");
const target = path.join(pluginDir, "server");

if (!existsSync(path.join(built, "index.js"))) {
  console.error(`prism: ${path.join(built, "index.js")} is missing — run "npm run build" first.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(built, target, { recursive: true });
console.log(`prism: packaged the server into ${path.relative(repoRoot, target)}`);
