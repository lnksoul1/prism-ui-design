import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import { buildTokenVarMap, writebackAll, writebackPreview, writebackTokens } from "../src/writeback.js";

let tempDir: string;
let clientDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "prism-writeback-"));
  clientDir = path.join(tempDir, "client");
  cpSync(path.resolve(process.cwd(), "client"), clientDir, { recursive: true });
  stateStore.resetForTests();
  stateStore.setProjectName("Writeback", "ai");
  applyStyleTokenSet(stateStore, "#7C3AED", "ai");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test("buildTokenVarMap maps design tokens to dashboard variables", () => {
  const map = buildTokenVarMap();
  const tokens = stateStore.getState().tokens;
  assert.equal(map["--accent"], tokens.colors["color-primary"].value);
  assert.equal(map["--bg"], tokens.colors["color-bg"].value);
  assert.ok(map["--radius"]);
  assert.ok(map["--shadow-sm"]);
  assert.ok(map["--font-display"]);
  assert.match(map["--border"] || "", /^rgba\(/);
});

test("writebackTokens rewrites :root vars and keeps a backup", () => {
  const result = writebackTokens(clientDir);
  const expectedAccent = stateStore.getState().tokens.colors["color-primary"].value;
  assert.equal(result.mode, "tokens");
  assert.ok(result.backup && existsSync(result.backup), "backup created");
  assert.ok(result.files.some((f) => f.endsWith("style.css")));

  const updated = readFileSync(path.join(clientDir, "style.css"), "utf-8");
  assert.ok(updated.includes(`--accent: ${expectedAccent};`), "accent token written");
  const backup = readFileSync(result.backup!, "utf-8");
  // The backup must preserve the dashboard's own (pre-writeback) values —
  // currently the modern-minimal glass palette.
  assert.ok(backup.includes("--bg: #F5F6F8;"), "backup preserves the original dashboard value");
  assert.ok(!backup.includes(`--accent: ${expectedAccent};`), "backup is the untouched original");
  // Unrelated variables survive the rewrite
  assert.match(updated, /--ease:/);
  assert.match(updated, /--spectrum-1:/);
});

test("writebackPreview writes the standalone design html", () => {
  stateStore.addComponent("hero", "centered", { title: "Hello" }, null, "ai");
  const result = writebackPreview(clientDir);
  assert.ok(result.files.some((f) => f.endsWith("design-writeback.html")));
  const html = readFileSync(path.join(clientDir, "design-writeback.html"), "utf-8");
  assert.match(html, /Hello/);
  assert.match(html, /--color-primary/);
});

test("writebackAll applies both token and preview writes", () => {
  const result = writebackAll(clientDir);
  assert.equal(result.mode, "all");
  assert.ok(result.backup);
  assert.ok(result.files.length >= 2);
  assert.ok(result.files.some((f) => f.endsWith("style.css")));
  assert.ok(result.files.some((f) => f.endsWith("design-writeback.html")));
});
