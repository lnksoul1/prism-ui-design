/**
 * One-off survey (not part of the build, not run by `npm test`).
 *
 * Renders every registered component type alone on a page through the real MCP
 * server, then measures the exported HTML in Chromium. The point is to judge
 * practical usability, not registration: a type can be in the catalog, have a
 * switch case, and still export as an empty or unreadable shell.
 *
 * Requires `playwright` (devDependency) and a cached Chromium.
 * Run: node survey-types.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("examples");
const PROBE = path.join(OUT, "type-probe.html");
const { chromium } = await import("playwright");

/** Props that give each type its best realistic chance of rendering content. */
const PROPS = {
  navbar: { brand: "Brand", links: ["A", "B"], cta_text: "Go" },
  hero: { title: "Hero headline here", subtitle: "Supporting line of copy", button_text: "Start" },
  footer: { copyright: "© 2026 Brand", links: ["A", "B"] },
  table: { columns: ["Svc", "Env"], rows: [["api", "prod"], ["web", "dev"]] },
  alert: { text: "Something happened" },
  cta: { title: "Call to action", subtitle: "Do it", button_text: "Go" },
  text_section: { title: "Section title", body: "A paragraph of body copy for this section." },
  faq: { items: [{ question: "Question one?", answer: "Answer one." }, { question: "Question two?", answer: "Answer two." }] },
  image: { alt: "Alt text" },
  html_fragment: { html: "<p>Fragment body</p>" },
  toggle: { label: "Enable thing" },
  avatar: { name: "Ann Lee" },
  badge: { text: "New" },
  breadcrumb: { items: ["Home", "Docs"] },
  pagination: { total: 5, current: 1 },
  progress: { value: 60, label: "Uploading" },
  input: { label: "Email", placeholder: "you@example.com" },
  tabs: { items: [{ label: "One", content: "Panel one" }, { label: "Two", content: "Panel two" }] },
  carousel: { items: [{ title: "Slide one", description: "D1" }, { title: "Slide two", description: "D2" }] },
  sidebar: { items: ["Dashboard", "Settings"] },
  banner: { title: "Announcement", subtitle: "Supporting detail" },
  tooltip: { text: "Tooltip body", label: "Hover" },
  modal: { title: "Dialog title", body: "Dialog body copy" },
  skeleton: { lines: 3 },
  command_palette: { items: ["Deploy", "Rollback", "Open logs"] },
  form: { fields: [{ label: "Email", type: "email" }], button_text: "Send" },
  grid: { items: [{ title: "Cell A", description: "Desc A" }, { title: "Cell B", description: "Desc B" }] },
  bento_grid: { items: [{ title: "Tile A", description: "D" }, { title: "Tile B", description: "D" }] },
  card: { title: "Card title", description: "Card body" },
  card_grid: { items: [{ title: "Prod A", price: "¥1", description: "D" }, { title: "Prod B", price: "¥2", description: "D" }] },
  stats: { items: [{ label: "Users", value: "1,234" }, { label: "Revenue", value: "¥9" }] },
  pricing: { plans: [{ name: "Basic", price: "¥9", features: ["A", "B"] }, { name: "Pro", price: "¥29", features: ["C"] }] },
  testimonial: { items: [{ name: "Ann", quote: "Great product, would buy again." }, { name: "Bo", quote: "Solid." }] },
  feature_list: { items: [{ title: "Fast", description: "Very fast" }, { title: "Safe", description: "Very safe" }] },
  button: { text: "Click me" },
  container: { title: "Group" },
  section: { title: "Section" },
  text: { text: "Plain text block" },
  feature_grid: { items: [{ title: "F1", description: "D1" }, { title: "F2", description: "D2" }] },
};
const GENERIC = { title: "T", description: "D", label: "L", text: "Body", items: [{ title: "A", description: "D", label: "L", quote: "Q", name: "N" }] };

// ---------- MCP client ----------
const child = spawn(process.execPath, [path.resolve("dist/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PRISM_AUTOSAVE: "off", PRISM_AUTOLOAD: "off", PRISM_PROJECT_DIR: path.resolve(".tmp-survey") },
});
let buf = "";
let id = 1;
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith("{")) continue;
    try {
      const m = JSON.parse(line);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    } catch { /* not a JSON-RPC frame */ }
  }
});
child.stderr.on("data", () => {});
const rpc = (method, params) => new Promise((res) => {
  const myId = id++;
  pending.set(myId, res);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
});
const call = (name, args = {}) => rpc("tools/call", { name, arguments: args });

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "survey", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const TYPES = JSON.parse(fs.readFileSync(path.resolve(".tmp-types.json"), "utf8"));

// ---------- render + measure, one type at a time ----------
const cached = path.join(process.env.USERPROFILE ?? "", "AppData", "Local", "ms-playwright", "chromium-1234", "chrome-win64", "chrome.exe");
const browser = await chromium.launch(fs.existsSync(cached) ? { executablePath: cached } : {});
const rows = [];
let n = 0;
for (const type of TYPES) {
  await call("design_init", { project_name: `Survey ${type}` });
  const added = await call("design_add_component", { type, props: PROPS[type] ?? GENERIC });
  const exp = await call("design_export", { format: "html" });
  const html = exp?.result?.structuredContent?.code ?? "";
  const failed = exp?.result?.isError === true || !html;
  fs.writeFileSync(PROBE, html, "utf8");

  // A fresh page per type, with a changing query so the file is re-read.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("file://" + PROBE + "?n=" + ++n, { waitUntil: "load" });
  const m = await page.evaluate(() => {
    const nodes = [...document.body.querySelectorAll("*")];
    const painted = nodes.filter((el) => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
      const shadow = cs.boxShadow && cs.boxShadow !== "none";
      const r = el.getBoundingClientRect();
      return (hasBg || bordered || shadow) && r.width > 1 && r.height > 1;
    }).length;
    const text = (document.body.textContent || "").replace(/\s+/g, " ").trim();
    return { elements: nodes.length, painted, textLen: text.length, text: text.slice(0, 44), height: document.body.scrollHeight };
  });
  await page.close();

  rows.push({
    type,
    accepted: added?.result?.isError !== true,
    id: added?.result?.structuredContent?.component_id ?? null,
    ...m,
    failed,
  });
}
await browser.close();
child.kill();

rows.sort((a, b) => a.elements - b.elements || a.textLen - b.textLen);
console.log("type".padEnd(17) + "els".padStart(5) + "paint".padStart(7) + "text".padStart(6) + "  sample");
for (const r of rows) {
  console.log(r.type.padEnd(17) + String(r.elements).padStart(5) + String(r.painted).padStart(7) + String(r.textLen).padStart(6) + "  " + r.text);
}
fs.writeFileSync(path.resolve(".tmp-survey.json"), JSON.stringify(rows, null, 2), "utf8");
