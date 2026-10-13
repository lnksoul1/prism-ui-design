/**
 * One-off (not part of the build): verify the re-implemented components in a real
 * browser — that tabs switch, the tooltip is hidden until hover, the marquee
 * animates, the carousel scrolls, and progress/skeleton are visible.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const { chromium } = await import("playwright");
const OUT = path.resolve("examples");

const child = spawn(process.execPath, [path.resolve("dist/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PRISM_AUTOSAVE: "off", PRISM_AUTOLOAD: "off", PRISM_PROJECT_DIR: path.resolve(".tmp-verify") },
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
await call("design_init", { project_name: "Component Verify" });

await call("design_add_component", { type: "tabs", props: { items: [
  { label: "Overview", content: "PANEL-ONE-TEXT" },
  { label: "Details", content: "PANEL-TWO-TEXT" },
] } });
await call("design_add_component", { type: "tooltip", props: { trigger: "Info", text: "TIP-TEXT" } });
await call("design_add_component", { type: "marquee", props: { items: ["Alpha", "Beta", "Gamma"] } });
await call("design_add_component", { type: "carousel", props: { items: [
  { title: "Slide A", description: "A" }, { title: "Slide B", description: "B" }, { title: "Slide C", description: "C" },
  { title: "Slide D", description: "D" }, { title: "Slide E", description: "E" },
] } });
await call("design_add_component", { type: "progress", props: { value: 65, label: "Upload" } });
await call("design_add_component", { type: "skeleton", props: { items: 3 } });

const exp = await call("design_export", { format: "html" });
const html = exp?.result?.structuredContent?.code ?? "";
fs.writeFileSync(path.join(OUT, "component-verify.html"), html, "utf8");
child.kill();

const cached = path.join(process.env.USERPROFILE ?? "", "AppData", "Local", "ms-playwright", "chromium-1234", "chrome-win64", "chrome.exe");
const browser = await chromium.launch(fs.existsSync(cached) ? { executablePath: cached } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("file://" + path.join(OUT, "component-verify.html"), { waitUntil: "load" });

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

// --- tabs: exactly one panel visible, and it is the first ---
const visiblePanels = await page.evaluate(() =>
  [...document.querySelectorAll(".tabs__panel")].filter((p) => getComputedStyle(p).display !== "none").map((p) => p.textContent.trim())
);
check("tabs: exactly one panel visible", visiblePanels.length === 1, JSON.stringify(visiblePanels));
check("tabs: first panel is the visible one", visiblePanels[0]?.includes("PANEL-ONE-TEXT"), visiblePanels[0] ?? "(none)");

// --- tabs: clicking the second label switches panels ---
let switched;
try {
  await page.click(".tabs__nav .tab:nth-child(2)");
  await page.waitForTimeout(80);
  switched = await page.evaluate(() =>
    [...document.querySelectorAll(".tabs__panel")].filter((p) => getComputedStyle(p).display !== "none").map((p) => p.textContent.trim()).join("|")
  );
} catch (e) { switched = "click failed: " + e.message.slice(0, 50); }
check("tabs: clicking label switches panel", switched.includes("PANEL-TWO-TEXT"), switched);

// --- tooltip: hidden by default, shown on hover ---
const bubbleBefore = await page.evaluate(() => getComputedStyle(document.querySelector(".tooltip__bubble")).visibility);
await page.hover(".tooltip");
await page.waitForTimeout(350);
const bubbleAfter = await page.evaluate(() => getComputedStyle(document.querySelector(".tooltip__bubble")).visibility);
check("tooltip: hidden by default", bubbleBefore === "hidden", bubbleBefore);
check("tooltip: visible on hover", bubbleAfter === "visible", bubbleAfter);

// --- marquee: animated + duplicated track ---
const mq = await page.evaluate(() => {
  const t = document.querySelector(".marquee__track");
  const cs = getComputedStyle(t);
  return { animation: cs.animationName, items: t.querySelectorAll(".marquee__item").length, duration: cs.animationDuration };
});
check("marquee: has animation", mq.animation === "prism-marquee", JSON.stringify(mq));
check("marquee: item list duplicated for a seamless loop", mq.items === 6, `items=${mq.items} (3 given, expect 6)`);

// --- carousel: horizontally scrollable, slides side by side ---
const car = await page.evaluate(() => {
  const c = document.querySelector(".carousel");
  const slides = [...c.querySelectorAll(".carousel__slide")];
  const tops = new Set(slides.map((s) => Math.round(s.getBoundingClientRect().top)));
  return { scrollW: c.scrollWidth, clientW: c.clientWidth, slides: slides.length, distinctRows: tops.size, snap: getComputedStyle(c).scrollSnapType };
});
check("carousel: scrolls horizontally", car.scrollW > car.clientW, JSON.stringify(car));
check("carousel: slides on one row", car.distinctRows === 1, `rows=${car.distinctRows}`);
check("carousel: scroll-snap enabled", car.snap.includes("x"), car.snap);

// --- progress: bar width reflects the value, label shown ---
const prog = await page.evaluate(() => {
  const bar = document.querySelector(".progress__bar");
  const track = document.querySelector(".progress__track");
  const w = (bar.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100;
  return { pct: Math.round(w), text: document.querySelector(".progress").textContent, aria: track.getAttribute("aria-valuenow") };
});
check("progress: bar ≈ 65% of track", Math.abs(prog.pct - 65) <= 3, `pct=${prog.pct}`);
check("progress: shows label + value", prog.text.includes("Upload") && prog.text.includes("65%"), prog.text);
check("progress: exposes aria-valuenow", prog.aria === "65", String(prog.aria));

// --- skeleton: lines visible (non-zero height) ---
const sk = await page.evaluate(() => {
  const lines = [...document.querySelectorAll(".skeleton__line")];
  return { count: lines.length, h: Math.round(lines[0]?.getBoundingClientRect().height ?? 0), anim: getComputedStyle(lines[0]).animationName };
});
check("skeleton: lines render with height", sk.count === 3 && sk.h > 0, JSON.stringify(sk));
check("skeleton: shimmer animation applied", sk.anim === "prism-shimmer", sk.anim);

await browser.close();

let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name.padEnd(48)} ${r.detail}`);
}
console.log(`\n${results.length - bad}/${results.length} checks passed`);
process.exit(bad === 0 ? 0 : 1);
