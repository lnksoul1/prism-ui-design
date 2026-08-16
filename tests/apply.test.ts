import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "node:os";
import path from "node:path";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import { importHtmlString } from "../src/import-project.js";
import { applyDesign, buildAdjustmentCss, productDir, rollbackApply } from "../src/apply.js";

let tmp: string;
let productTmp: string;
let originalProjectDir: string | undefined;
let originalProductDir: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "prism-apply-"));
  productTmp = mkdtempSync(path.join(os.tmpdir(), "prism-products-"));
  originalProjectDir = process.env.PRISM_PROJECT_DIR;
  originalProductDir = process.env.PRISM_PRODUCT_DIR;
  process.env.PRISM_PROJECT_DIR = tmp;
  process.env.PRISM_PRODUCT_DIR = productTmp;
  stateStore.resetForTests();
  applyStyleTokenSet(stateStore, "#7C3AED", "ai");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(productTmp, { recursive: true, force: true });
  if (originalProjectDir === undefined) delete process.env.PRISM_PROJECT_DIR;
  else process.env.PRISM_PROJECT_DIR = originalProjectDir;
  if (originalProductDir === undefined) delete process.env.PRISM_PRODUCT_DIR;
  else process.env.PRISM_PRODUCT_DIR = originalProductDir;
});

test("buildAdjustmentCss emits design tokens as :root variables", () => {
  const css = buildAdjustmentCss();
  assert.match(css, /:root \{/);
  assert.match(css, /--accent: /);
  assert.match(css, /--bg: /);
  assert.match(css, /--radius:/);
  assert.match(css, /prism-adjustments\.css/, "documented as a drop-in link");
});

test("applyDesign writes the adjusted page + CSS with backups; rollback restores", () => {
  stateStore.setProjectName("我的产品", "ai");
  stateStore.addComponent("hero", undefined, { title: "Hello" }, null, "ai");

  const first = applyDesign();
  assert.equal(first.success, true);
  assert.equal(first.files.length, 2, "adjusted html + adjustment css");
  assert.ok(first.files.every((f) => existsSync(f.file)));
  assert.ok(first.files.some((f) => f.file.endsWith(".html")));
  assert.ok(first.files.some((f) => f.file.endsWith("prism-adjustments.css")));
  assert.equal(first.backup, null, "no backup on first apply");

  // Change the design, apply again → a backup of the previous files is kept
  stateStore.setToken("colors", "color-primary", "#FF5500", "user");
  const second = applyDesign();
  assert.equal(second.success, true);
  assert.ok(second.backup, "second apply creates a backup");
  assert.ok(existsSync(second.backup!), "backup file exists");

  const htmlBefore = readFileSync(first.files.find((f) => f.file.endsWith(".html"))!.file, "utf-8");
  assert.match(htmlBefore, /Hello/, "adjusted html contains the design");

  // Rollback restores the backed-up artifacts
  const roll = rollbackApply();
  assert.equal(roll.success, true);
  assert.ok(Number(roll.restored) > 0, `rollback restored count: ${roll.restored}`);
  const cssAfterRollback = readFileSync(
    first.files.find((f) => f.file.endsWith("prism-adjustments.css"))!.file,
    "utf-8"
  );
  assert.ok(!cssAfterRollback.includes("#FF5500"), "rollback restored the pre-change tokens");
  assert.match(cssAfterRollback, /--accent: /);
});

test("applyDesign writes adjusted HTML back to the original file source in place", () => {
  const original = "<html><head><title>File source</title></head><body><nav><a>旧导航</a></nav><footer>f</footer></body></html>";
  const sourceFile = path.join(tmp, "index.html");
  const snapshotFile = path.join(tmp, "imports", "page.html");
  mkdirSync(path.dirname(snapshotFile), { recursive: true });
  writeFileSync(sourceFile, original, "utf-8");
  writeFileSync(snapshotFile, original, "utf-8");

  const imported = importHtmlString(original, "index.html", true);
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === imported.pageId)!;
  const nav = page.components.find((c) => (c.props as { region?: string }).region === "nav")!;
  stateStore.updateComponent(nav.id, { html: String(nav.props.html).replace("旧导航", "新导航") }, "user");
  stateStore.setImport(page.id, {
    kind: "file",
    source: "index.html",
    html_file: snapshotFile,
    imported_at: new Date().toISOString(),
    component_count: page.components.length,
    source_file: sourceFile,
    source_is_html: true,
  }, "user");

  const result = applyDesign();
  assert.equal(result.success, true);
  assert.ok(result.files.some((f) => f.file === sourceFile), "writeback targets the original file");
  const rewritten = readFileSync(sourceFile, "utf-8");
  assert.match(rewritten, /新导航/, "edited fragment is written into the original document");
  assert.match(rewritten, /<title>File source<\/title>/, "original head is preserved");

  const roll = rollbackApply();
  assert.equal(roll.success, true);
  const restored = readFileSync(sourceFile, "utf-8");
  assert.doesNotMatch(restored, /新导航/, "rollback restores the original file");
});

test("applyDesign rebuilds URL imports from the original document and injects base", () => {
  const original = "<html><head><title>URL source</title></head><body><nav><a>旧链接</a></nav><footer>f</footer><script>window.__urlSource = true;</script></body></html>";
  const snapshotFile = path.join(tmp, "imports", "url-page.html");
  mkdirSync(path.dirname(snapshotFile), { recursive: true });
  writeFileSync(snapshotFile, original, "utf-8");

  const imported = importHtmlString(original, "example.com", true);
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === imported.pageId)!;
  const nav = page.components.find((c) => (c.props as { region?: string }).region === "nav")!;
  stateStore.updateComponent(nav.id, { html: String(nav.props.html).replace("旧链接", "新链接") }, "user");
  stateStore.setImport(page.id, {
    kind: "url",
    source: "example.com",
    url: "https://example.com/page",
    base_url: "https://example.com/page",
    html_file: snapshotFile,
    imported_at: new Date().toISOString(),
    component_count: page.components.length,
  }, "user");

  const result = applyDesign();
  assert.equal(result.success, true);
  const htmlFile = result.files.find((f) => f.file.endsWith(".html"))!;
  const rebuilt = readFileSync(htmlFile.file, "utf-8");
  assert.match(rebuilt, /<base href="https:\/\/example\.com\/page">/);
  assert.match(rebuilt, /<title>URL source<\/title>/);
  assert.match(rebuilt, /window\.__urlSource = true;/);
  assert.match(rebuilt, /新链接/);
});



test("rollbackApply reports when there is nothing to restore", () => {
  const result = rollbackApply();
  assert.equal(result.success, false);
  assert.match(result.message, /没有可回滚/);
});

test("productDir honors PRISM_PRODUCT_DIR", () => {
  assert.equal(productDir(), productTmp);
});
