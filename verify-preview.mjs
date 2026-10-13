/** One-off: verify design_preview_sync writes a watchable, self-contained preview. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PREVIEW = path.resolve(".tmp-preview-check/design.html");
const child = spawn(process.execPath, [path.resolve("dist/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    PRISM_AUTOSAVE: "off",
    PRISM_AUTOLOAD: "off",
    PRISM_PROJECT_DIR: path.resolve(".tmp-preview-check/proj"),
    PRISM_PREVIEW_FILE: PREVIEW,
  },
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

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "p", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const tools = await rpc("tools/list", {});
const names = (tools?.result?.tools ?? []).map((t) => t.name);
console.log(`tools: ${names.length}`);
console.log(`design_preview_sync registered: ${names.includes("design_preview_sync")}`);

await call("design_init", { project_name: "Preview Check", base_color: "#8B5E3C" });
await call("design_apply_template", { template: "saas_landing" });

// First sync creates the directory; only then can a watcher attach to it.
const r1 = await call("design_preview_sync", {});
const sc1 = r1?.result?.structuredContent;
console.log(`\nsync #1 -> path=${sc1?.path} bytes=${sc1?.bytes} components=${sc1?.component_count} rev=${sc1?.revision}`);
console.log(`file exists: ${fs.existsSync(PREVIEW)}`);

// Now watch the directory and confirm a second sync notifies us.
const seen = [];
const watcher = fs.watch(path.dirname(PREVIEW), (_e, file) => { if (file === "design.html") seen.push(Date.now()); });

const doc = fs.readFileSync(PREVIEW, "utf8");
console.log(`\nself-contained checks:`);
console.log(`  no external http(s) refs in body: ${!/https?:\/\//.test(doc.slice(doc.indexOf("</style>")))}`);
console.log(`  has inline <style>: ${doc.includes("<style")}`);
console.log(`  has preview revision meta: ${doc.includes("prism-preview-revision")}`);
console.log(`  has </html>: ${doc.trimEnd().endsWith("</html>")}`);

// Change the design, then sync again and confirm the file changed.
await call("design_add_component", { type: "cta", variant: "banner", props: { title: "Sec" } });
const r2 = await call("design_preview_sync", {});
const sc2 = r2?.result?.structuredContent;
const doc2 = fs.readFileSync(PREVIEW, "utf8");
console.log(`\nsync #2 -> bytes=${sc2?.bytes} rev=${sc2?.revision}`);
console.log(`  revision increased: ${sc2?.revision > sc1?.revision}`);
console.log(`  byte size grew (component added): ${sc2?.bytes > sc1?.bytes}`);
console.log(`  revision meta updated: ${doc2.includes(String(sc2?.revision))}`);
await new Promise((r) => setTimeout(r, 400));
watcher.close();
console.log(`\nfile-watch events observed: ${seen.length} (a viewer following this path sees the update)`);

child.kill();
fs.rmSync(path.resolve(".tmp-preview-check"), { recursive: true, force: true });
