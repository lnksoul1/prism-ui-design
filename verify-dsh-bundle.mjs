/**
 * One-off: verify the DSH bundle is well-formed as far as static checks can tell.
 *
 * This cannot prove the panel renders — that needs DSH to load it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIR = path.resolve("dsh-plugin");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

// --- 1. required files exist ---
const REQUIRED = ["package.json", "index.js", "client.js", "cordis.patch.yml", "locale/en.json"];
for (const f of REQUIRED) {
  const p = path.join(DIR, f);
  check(`file exists: ${f}`, fs.existsSync(p), fs.existsSync(p) ? `${fs.statSync(p).size} bytes` : "MISSING");
}

// --- 2. JSON parses and the manifest matches DSH's contract ---
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8"));
  check("package.json parses", true);
} catch (e) {
  check("package.json parses", false, e.message);
}
if (manifest) {
  // Host-only bundle contract: name, version, dsh.bundle.patch.
  check("manifest has a unique name", /^@local\/[a-z0-9-]+$/.test(manifest.name), manifest.name);
  check("manifest has a version", typeof manifest.version === "string", manifest.version);
  check("manifest declares dsh.bundle.patch", !!manifest.dsh?.bundle?.patch, manifest.dsh?.bundle?.patch);
  // UI-plugin contract from references/ui-plugin.md.
  check("manifest declares dsh.client.platform", manifest.dsh?.client?.platform === "web", String(manifest.dsh?.client?.platform));
  check("manifest declares dsh.client.immediately", manifest.dsh?.client?.immediately === true, String(manifest.dsh?.client?.immediately));
  check("manifest declares a ./client export", !!manifest.exports?.["./client"], manifest.exports?.["./client"]);
  // The patch path must resolve.
  check(
    "dsh.bundle.patch points at a real file",
    fs.existsSync(path.join(DIR, manifest.dsh.bundle.patch))
  );
  // Any exported path must exist.
  for (const [k, v] of Object.entries(manifest.exports ?? {})) {
    if (v.includes("*")) continue;
    check(`export ${k} resolves`, fs.existsSync(path.join(DIR, v)), v);
  }
}

// --- 3. every recognized plugin name is a real DSH package ---
// Package names are checked against the shipped runtime listing when it has been
// extracted (`node extract-asar.mjs`); otherwise against the known set, so this
// script stays runnable without the extraction step.
const patchText = fs.readFileSync(path.join(DIR, "cordis.patch.yml"), "utf8");
const KNOWN_DSH_PACKAGES = new Set([
  "@deepseek-ai/dsh-mcp-client",
  "@deepseek-ai/dsh-mcp-resources",
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
]);
if (manifest) {
  const names = [...patchText.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
  const runtimePath = ".dsh-src/dsh/desktop-runtime.json";
  let shared = KNOWN_DSH_PACKAGES;
  let source = "known-package list";
  if (fs.existsSync(runtimePath)) {
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    shared = new Set(runtime.sharedPackages.map((p) => p.name));
    source = "extracted runtime listing";
  }
  for (const n of names) {
    const local = n === manifest.name;
    check(
      `patch plugin "${n}" is resolvable`,
      local || shared.has(n),
      local ? "this bundle" : shared.has(n) ? source : "NOT FOUND"
    );
  }
}

// --- 4. JS syntax ---
for (const f of ["index.js", "client.js"]) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) continue;
  try {
    // Parse without executing: --check does a syntax-only parse.
    execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
    check(`${f} parses`, true);
  } catch (e) {
    check(`${f} parses`, false, String(e.stderr ?? e.message).split("\n")[0]);
  }
}

// --- 5. client.js uses only the documented module-loader shape ---
{
  const src = fs.readFileSync(path.join(DIR, "client.js"), "utf8");
  check("client.js uses window.__ModuleLoader__.load", src.includes("window.__ModuleLoader__.load("));
  check("client.js factory id equals the package name", manifest ? src.includes(`id: '${manifest.name}'`) : false);
  check("client.js requires React from the module table", src.includes("require('react')"));
  check("client.js does not import a Harness Client package", !/@deepseek-ai\/dsh-client-/.test(src));
  check("client.js registers into sidebar.right.pane.tab", src.includes("'sidebar.right.pane.tab'"));
  check("client.js declares inject: slots + remote", /inject:\s*\['slots',\s*'remote'\]/.test(src));
  check("client.js has no naked document.body access", !/document\.body/.test(src));
}

// --- 6. locale JSON parses ---
try {
  JSON.parse(fs.readFileSync(path.join(DIR, "locale/en.json"), "utf8"));
  check("locale/en.json parses", true);
} catch (e) {
  check("locale/en.json parses", false, e.message);
}

// --- report ---
let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name.padEnd(52)} ${r.detail}`);
}
console.log(`\n${results.length - bad}/${results.length} static checks passed`);
console.log("\nNOTE: these are static/structural checks only. They cannot establish that DSH");
console.log("loads the bundle or that the panel renders; that requires installing it.");
process.exit(bad === 0 ? 0 : 1);
