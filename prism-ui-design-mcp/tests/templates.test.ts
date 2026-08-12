import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { stateStore } from "../src/state.js";
import { listTemplates, loadTemplate, saveTemplate } from "../src/templates.js";
import { applyStyleTokenSet } from "../src/tokens.js";

let tempDir: string;
let originalDir: string | undefined;

beforeEach(() => {
  originalDir = process.env.PRISM_PROJECT_DIR;
  tempDir = mkdtempSync(path.join(os.tmpdir(), "prism-templates-"));
  process.env.PRISM_PROJECT_DIR = tempDir;
  stateStore.resetForTests();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (originalDir === undefined) delete process.env.PRISM_PROJECT_DIR;
  else process.env.PRISM_PROJECT_DIR = originalDir;
});

test("saveTemplate writes a .prism-template.json file with style + tokens + pages", () => {
  stateStore.setProjectName("Template Source", "ai");
  applyStyleTokenSet(stateStore, "tech", "#06B6D4", "ai");
  stateStore.addComponent("navbar", "with_cta", { brand: "Prism" }, null, "ai");
  stateStore.addComponent("hero", "centered", { title: "T" }, null, "ai");

  const result = saveTemplate("Landing");
  assert.ok(result.file.endsWith(".prism-template.json"));
  assert.equal(result.name, "Landing");
  assert.equal(result.component_count, 2);

  const templates = listTemplates();
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, "Landing");
  assert.equal(templates[0].component_count, 2);
});

test("loadTemplate restores style/tokens/pages and preserves project name", () => {
  stateStore.setProjectName("Original Project", "ai");
  stateStore.setStyle("bold", "ai");
  applyStyleTokenSet(stateStore, "bold", "#7C3AED", "ai");
  stateStore.addComponent("cta", "centered", { title: "Go" }, null, "ai");
  const saved = saveTemplate("CTA");

  stateStore.setProjectName("Changed Name", "ai");
  stateStore.addComponent("footer", undefined, {}, null, "ai");
  const loaded = loadTemplate(saved.file);
  assert.equal(loaded.name, "CTA");
  assert.equal(loaded.component_count, 1);

  const state = stateStore.getState();
  assert.equal(state.projectName, "Changed Name", "template load keeps current project name");
  assert.equal(state.style, "bold");
  assert.equal(state.components[0].type, "cta");
  assert.ok(Object.keys(state.tokens.colors).length > 0);
});

test("loadTemplate rejects non-template files", () => {
  const bad = path.join(tempDir, "bad.prism-template.json");
  writeFileSync(bad, JSON.stringify({ schema: "other", pages: [] }), "utf-8");
  assert.throws(() => loadTemplate(bad), /missing schema/);
});
