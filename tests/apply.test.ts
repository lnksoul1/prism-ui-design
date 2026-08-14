import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "node:os";
import path from "node:path";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
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
  assert.ok(roll.restored && existsSync(roll.restored), "restored file exists");
  const cssAfterRollback = readFileSync(
    first.files.find((f) => f.file.endsWith("prism-adjustments.css"))!.file,
    "utf-8"
  );
  assert.ok(!cssAfterRollback.includes("#FF5500"), "rollback restored the pre-change tokens");
  assert.match(cssAfterRollback, /--accent: /);
});

test("rollbackApply reports when there is nothing to restore", () => {
  const result = rollbackApply();
  assert.equal(result.success, false);
  assert.match(result.message, /没有可回滚/);
});

test("productDir honors PRISM_PRODUCT_DIR", () => {
  assert.equal(productDir(), productTmp);
});
