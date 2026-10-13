/**
 * One-off audit tool (not part of the build, not run by `npm test`).
 *
 * Exports a page containing every component type and variant, then asks a real
 * browser two questions that static reading cannot answer reliably:
 *
 *   1. which component root classes have no CSS rule at all?
 *   2. which variant rules fail to change the computed style of what they target?
 *
 * Catches the class of bug where a variant emits a class name that no rule
 * matches (e.g. `card_grid--3col` vs `.card-grid--3col`), or where a rule uses a
 * descendant selector while the class it names sits on the same element.
 *
 * Requires `playwright` (devDependency) and a cached Chromium.
 * Run: node audit-rendered-css.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("examples");
const HTML_FILE = "variant-audit.html";

/** (component type, variant) pairs worth exercising. */
const PAIRS = [
  ["hero", "split"], ["navbar", "centered"], ["grid", "3col"], ["card_grid", "3col"],
  ["pricing", "3col"], ["stats", "inline"], ["faq", "accordion"], ["testimonial", "grid"],
  ["testimonial", "single"], ["feature_list", "icon_grid"], ["footer", "multi_column"],
  ["timeline", "horizontal"], ["tabs", "pill"], ["breadcrumb", "slash"],
  ["avatar", "group"], ["carousel", "cards"],
  ["alert", "warning"], ["bento_grid", "mixed"], ["marquee", "logo"],
  ["tooltip", undefined], ["progress", undefined], ["skeleton", undefined],
];

/** [selector, cssProperty, human expectation, predicate] */
const PROBES = [
  [".testimonials.testimonial--grid", "gridTemplateColumns", ">=2 tracks", (v) => trackCount(v) >= 2],
  [".card-grid--3col", "gridTemplateColumns", "3 tracks", (v) => trackCount(v) === 3],
  [".grid--3col", "gridTemplateColumns", "3 tracks", (v) => trackCount(v) === 3],
  [".pricing--3col .pricing__grid", "gridTemplateColumns", "3 tracks", (v) => trackCount(v) === 3],
  [".bento-grid--mixed", "display", "grid", (v) => v === "grid"],
  [".feature-list--icon_grid .feature-list__grid", "gridTemplateColumns", ">=2 tracks", (v) => trackCount(v) >= 2],
  [".footer--multi_column", "gridTemplateColumns", ">=2 tracks", (v) => trackCount(v) >= 2],
  [".faq--accordion .faq__item", "borderBottomWidth", "1px", (v) => v === "1px"],
  [".hero--split", "display", "flex", (v) => v === "flex"],
  [".navbar--centered", "flexDirection", "column", (v) => v === "column"],
  [".avatar--group", "display", "inline-flex", (v) => v === "inline-flex"],
  [".grid", "display", "grid", (v) => v === "grid"],
  [".bento", "display", "grid", (v) => v === "grid"],
  [".tabs__panel:nth-child(1)", "display", "block", (v) => v === "block"],
  [".tooltip__bubble", "visibility", "hidden", (v) => v === "hidden"],
];

/** Component root classes that legitimately have no rule of their own. */
const ALLOWED_UNSTYLED = new Set([
  "button", // renders as .btn
  "bento-grid", // renders as .bento
  "container", "section", "text", "html-fragment", // layout/text primitives
  "component", // the data-unsupported placeholder wrapper (hidden)
]);

function trackCount(v) {
  return String(v).split(" ").filter((t) => t && t !== "0px" && t !== "none").length;
}

// ---------- build the audit page through the real MCP server ----------
const child = spawn(process.execPath, [path.resolve("dist/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PRISM_AUTOSAVE: "off", PRISM_AUTOLOAD: "off", PRISM_PROJECT_DIR: path.resolve(".tmp-audit") },
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

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "audit", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
await call("design_init", { project_name: "Variant Audit" });

// Multi-item content: a single item can only fill one grid track, which makes a
// working variant look inert.
const ITEMS = [0, 1, 2].map((n) => ({
  title: `T${n}`, label: `L${n}`, name: `N${n}`, quote: `Q${n}`,
  question: `Q${n}`, answer: `A${n}`, description: `D${n}`,
}));
for (const [type, variant] of PAIRS) {
  await call("design_add_component", {
    type,
    variant,
    props: {
      title: "T", text: "T", copyright: "© Test", items: ITEMS,
      plans: ITEMS.map((it, n) => ({ name: `P${n}`, price: `${n}` })),
      columns: ["a", "b"], rows: [["1", "2"]],
    },
  });
}
const exported = await call("design_export", { format: "html" });
fs.writeFileSync(path.join(OUT, HTML_FILE), exported?.result?.structuredContent?.code ?? "", "utf8");
child.kill();

// ---------- ask the browser ----------
const { chromium } = await import("playwright");
const cached = path.join(process.env.USERPROFILE ?? "", "AppData", "Local", "ms-playwright", "chromium-1234", "chrome-win64", "chrome.exe");
const browser = await chromium.launch(fs.existsSync(cached) ? { executablePath: cached } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("file://" + path.join(OUT, HTML_FILE), { waitUntil: "load" });

const [probeValues, stateTypes] = await Promise.all([
  page.evaluate((probes) => {
    return probes.map(([sel, prop]) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    });
  }, PROBES.map(([s, p]) => [s, p])),
  // Component root classes present in the page.
  page.evaluate(() => [...document.querySelectorAll("body > *")].map((e) => e.className)),
]);
const style = fs.readFileSync(path.join(OUT, HTML_FILE), "utf8");
const css = style.slice(style.indexOf("<style"), style.indexOf("</style>"));

console.log("=== variant rules ===");
let bad = 0;
PROBES.forEach(([sel, prop, want, pred], i) => {
  const v = probeValues[i];
  const ok = v !== null && pred(v);
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${sel.padEnd(46)} ${prop.padEnd(20)} = ${String(v).slice(0, 38)}  (want ${want})`);
});

console.log("\n=== unstyled component roots ===");
const unstyled = new Set();
for (const cls of stateTypes) {
  for (const c of String(cls).split(/\s+/)) {
    if (c.includes("--") || !c) continue;
    const re = new RegExp("\\." + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s*[\\s,{]|__|--)");
    if (!re.test(css) && !ALLOWED_UNSTYLED.has(c)) unstyled.add(c);
  }
}
if (!unstyled.size) console.log("(none — every layout root has a rule)");
for (const c of unstyled) console.log("  ." + c);

await browser.close();
const failed = bad + unstyled.size;
console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${bad} inert variant rule(s), ${unstyled.size} unstyled root(s)`);
process.exit(failed === 0 ? 0 : 1);
