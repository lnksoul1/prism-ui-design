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
const REQUIRED = [
  "package.json",
  "host-entry.mjs",
  "client.js",
  "cordis.patch.yml",
  "locale/en.json",
];
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
  // Marketplace id rule (dsh.so): a plain kebab-case package name.
  check("manifest name is a publishable plugin id", /^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name), manifest.name);
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
  // Distribution: the plugin launches a server, so it has to carry one and the
  // dependencies that server needs at runtime.
  check("manifest ships the packaged server", (manifest.files ?? []).includes("server"));
  check(
    "manifest ships a package README",
    (manifest.files ?? []).includes("README.md") && fs.existsSync(path.join(DIR, "README.md"))
  );
  // The marketplace's format check looks for a licence beside the manifest, so the
  // plugin package carries its own copy rather than relying on the repository root.
  check(
    "manifest ships a LICENSE",
    (manifest.files ?? []).includes("LICENSE") && fs.existsSync(path.join(DIR, "LICENSE"))
  );
  check(
    "manifest declares the server's runtime dependencies",
    ["@modelcontextprotocol/sdk", "js-yaml", "zod"].every(
      (d) => typeof manifest.dependencies?.[d] === "string"
    ),
    Object.keys(manifest.dependencies ?? {}).join(", ")
  );
  check(
    "manifest rebuilds the server copy before packing",
    typeof manifest.scripts?.prepack === "string" && manifest.scripts.prepack.includes("copy-server"),
    manifest.scripts?.prepack
  );
}

// --- 3. every recognized plugin name is a real DSH package ---
// Package names are checked against the shipped runtime listing when it has been
// extracted (`node extract-asar.mjs`); otherwise against the known set, so this
// script stays runnable without the extraction step.
const patchText = fs.readFileSync(path.join(DIR, "cordis.patch.yml"), "utf8");
// The bundle ships to machines that never saw this checkout: every path must be
// derived at load time — `createRequire(baseUrl)` for the installed package,
// `dshHomePath` for the Harness home — rather than written into the patch.
{
  const hardCoded = /[A-Za-z]:[\\/]/.test(patchText) || /file:\/\/\/[A-Za-z]:/.test(patchText);
  check(
    "patch hard-codes no checkout path",
    !hardCoded,
    hardCoded ? "a drive-letter path is written into the patch" : "paths are expression-derived"
  );
  check(
    "patch derives paths from the installed package and the Harness home",
    /createRequire\(baseUrl\)/.test(patchText) && /dshHomePath\(/.test(patchText)
  );
}
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
    // A row may name its module by absolute file URL instead of by package: a
    // bundle linked in from outside the profile resolves by package name, but a
    // subpath of it does not resolve through the profile's module layer.
    const fileUrl = /^(file:|\/|[A-Za-z]:[\\/])/.test(n);
    if (fileUrl) {
      let exists = false;
      let detail = "NOT FOUND";
      try {
        exists = fs.existsSync(n.startsWith("file:") ? new URL(n) : n);
        detail = exists ? "local file" : detail;
      } catch {
        // An unresolvable URL is reported as a miss below.
      }
      check(`patch plugin "${n}" is resolvable`, exists, detail);
      continue;
    }
    check(
      `patch plugin "${n}" is resolvable`,
      local || shared.has(n),
      local ? "this bundle" : shared.has(n) ? source : "NOT FOUND"
    );
  }
}

// --- 4. JS syntax ---
for (const f of ["host-entry.mjs", "client.js", "scripts/copy-server.mjs"]) {
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

// --- 4b. the Host half keeps its Config dependency-free ---
{
  const src = fs.readFileSync(path.join(DIR, "host-entry.mjs"), "utf8");
  check("host-entry.mjs config is a Standard Schema", src.includes('"~standard"'));
  check(
    "host-entry.mjs imports no Harness package",
    !/from\s+["']@deepseek-ai\//.test(src),
    "a linked bundle cannot resolve Harness packages"
  );
}

// --- 5. client.js uses only the documented module-loader shape ---
{
  const src = fs.readFileSync(path.join(DIR, "client.js"), "utf8");
  check("client.js uses window.__ModuleLoader__.load", src.includes("window.__ModuleLoader__.load("));
  check("client.js factory id equals the package name", manifest ? src.includes(`id: '${manifest.name}'`) : false);
  check("client.js requires React from the module table", src.includes("require('react')"));
  check("client.js does not import a Harness Client package", !/@deepseek-ai\/dsh-client-/.test(src));
  check("client.js registers into sidebar.right.pane.tab", src.includes("'sidebar.right.pane.tab'"));
  check(
    "client.js declares the services it uses",
    /inject:\s*\[[^\]]*'slots'[^\]]*'sidebarRightTabs'[^\]]*'remote'[^\]]*'remote\.workspaceFiles'[^\]]*\]/.test(
      src
    )
  );
  check(
    "client.js binds its Remote read to one session id",
    /const makeReader = \(sessionId\)[\s\S]{0,200}readBytes\(\s*sessionId/.test(src)
  );
  check(
    "client.js feeds the tab's session into that reader",
    /readPreview:\s*makeReader\(sessionId\)/.test(src)
  );
  // Remote calls answer `{ ok, value }` / `{ ok, error }`; reading `.data` off
  // the envelope silently yields an empty document.
  check(
    "client.js unwraps the Remote result envelope",
    /unwrapRemote\(await readPreview/.test(src) && /typeof result\.ok === 'boolean'/.test(src)
  );
  // The right Sidebar's GuideBody calls `entry.title()` and
  // `entry.description?.()`, so a string for either field throws inside the
  // guide and takes that whole tab down.
  check(
    "client.js guide entry reads title and description as thunks",
    /guide:\s*\[[\s\S]{0,400}?title:\s*\(\)\s*=>[\s\S]{0,200}?description:\s*\(\)\s*=>/.test(src)
  );
  check("client.js has no naked document.body access", !/document\.body/.test(src));
  // The preview iframe holds agent-authored markup: allow-scripts alone keeps it
  // in an opaque origin. allow-same-origin would let it reach the Harness origin.
  check(
    "client.js sandboxes the preview without allow-same-origin",
    /sandbox:\s*'allow-scripts'/.test(src) && !/sandbox:\s*'[^']*allow-same-origin/.test(src)
  );
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
