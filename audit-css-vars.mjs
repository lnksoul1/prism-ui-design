/**
 * One-off (not part of the build): how many CSS custom properties does an export
 * declare, and how many are actually referenced by the stylesheet or markup?
 */
import { spawn } from "node:child_process";
import path from "node:path";

const child = spawn(process.execPath, [path.resolve("dist/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PRISM_AUTOSAVE: "off", PRISM_AUTOLOAD: "off", PRISM_PROJECT_DIR: path.resolve(".tmp-vars") },
});
let buf = "", id = 1;
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith("{")) continue;
    try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch { /* ignore */ }
  }
});
child.stderr.on("data", () => {});
const rpc = (m, p) => new Promise((res) => { const i = id++; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method: m, params: p }) + "\n"); });
const call = (n, a = {}) => rpc("tools/call", { name: n, arguments: a });

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "v", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

await call("design_init", { project_name: "Var Audit" });
await call("design_apply_template", { template: "saas_landing" });
const exp = await call("design_export", { format: "html" });
const html = exp?.result?.structuredContent?.code ?? "";
child.kill();

// Declared custom properties.
const declared = new Set([...html.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
// Referenced via var(...).
const used = new Set([...html.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));

const unused = [...declared].filter((d) => !used.has(d)).sort();
console.log(`export size: ${html.length} chars`);
console.log(`declared custom properties: ${declared.size}`);
console.log(`referenced via var():       ${used.size}`);
console.log(`declared but never used:    ${unused.length}\n`);

// Group by token family for readability.
const families = {};
for (const u of unused) {
  const fam = u.replace(/^--/, "").split("-")[0];
  (families[fam] ??= []).push(u);
}
for (const [fam, list] of Object.entries(families).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${fam.padEnd(14)} ${String(list.length).padStart(3)}  ${list.slice(0, 6).join(" ")}${list.length > 6 ? " …" : ""}`);
}

const unusedBytes = unused.reduce((n, u) => n + u.length + 20, 0);
console.log(`\napproximate bytes spent on unused declarations: ${unusedBytes} (${((unusedBytes / html.length) * 100).toFixed(1)}% of the file)`);
