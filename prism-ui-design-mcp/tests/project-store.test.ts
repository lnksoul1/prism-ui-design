import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import {
  saveProject,
  loadProject,
  listProjects,
  autosavePath,
} from "../src/project-store.js";

let tempDir: string;
let originalDir: string | undefined;

beforeEach(() => {
  originalDir = process.env.PRISM_PROJECT_DIR;
  tempDir = mkdtempSync(path.join(os.tmpdir(), "prism-project-"));
  process.env.PRISM_PROJECT_DIR = tempDir;
  stateStore.resetForTests();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (originalDir === undefined) {
    delete process.env.PRISM_PROJECT_DIR;
  } else {
    process.env.PRISM_PROJECT_DIR = originalDir;
  }
});

test("saveProject writes a loadable .prism.json file", () => {
  stateStore.setProjectName("Test Landing", "ai");
  stateStore.setStyle("bold", "ai");
  stateStore.addComponent("hero", "centered", { title: "Hello" }, null, "ai");

  const result = saveProject();
  assert.ok(result.file.endsWith(".prism.json"));
  assert.equal(result.project_name, "Test Landing");
  assert.equal(result.component_count, 1);
  assert.ok(existsSync(result.file));

  const raw = JSON.parse(readFileSync(result.file, "utf-8")) as Record<string, unknown>;
  assert.equal(raw.schema, "prism-project");
  assert.equal(raw.version, 1);
  const project = raw.project as Record<string, unknown>;
  assert.equal(project.projectName, "Test Landing");
});

test("loadProject restores project name, pages, components, and tokens", () => {
  stateStore.setProjectName("Persisted", "ai");
  stateStore.setStyle("tech", "ai");
  applyStyleTokenSet(stateStore, "tech", "#06B6D4", "ai");
  const comp = stateStore.addComponent("navbar", "with_cta", { brand: "Prism" }, null, "ai");
  const saved = saveProject();

  stateStore.resetForTests();
  assert.equal(stateStore.getState().projectName, "Untitled Project");

  const loaded = loadProject(saved.file);
  assert.equal(loaded.project_name, "Persisted");
  assert.equal(loaded.component_count, 1);
  assert.equal(loaded.page_count, 1);

  const state = stateStore.getState();
  assert.equal(state.projectName, "Persisted");
  assert.equal(state.style, "tech");
  assert.equal(state.components[0].id, comp.id);
  assert.equal(state.components[0].type, "navbar");
  assert.ok(Object.keys(state.tokens.colors).length > 0, "tokens restored");
});

test("listProjects returns saved files newest first", () => {
  saveProject("First");
  stateStore.addComponent("card", undefined, { title: "x" }, null, "ai");
  saveProject("Second");

  const projects = listProjects();
  assert.equal(projects.length, 2);
  // Newest first (Second saved after First)
  assert.equal(projects[0].name, "Second");
  assert.ok(projects[0].file.startsWith(tempDir));
  assert.equal(projects[0].component_count, 1);
});

test("loadProject rejects invalid files", () => {
  const bad = path.join(tempDir, "bad.prism.json");
  writeFileSync(bad, JSON.stringify({ hello: "world" }), "utf-8");
  assert.throws(() => loadProject(bad), /missing 'project\.pages'/);
  assert.throws(() => loadProject(path.join(tempDir, "missing.prism.json")));
});

test("restoreSnapshot resets undo history and pending prompt", () => {
  stateStore.setProjectName("Snap", "ai");
  const saved = saveProject();
  stateStore.setPendingPrompt("please change color");
  stateStore.addComponent("button", undefined, { text: "x" }, null, "ai");
  assert.equal(stateStore.canUndo(), true);

  loadProject(saved.file);
  const state = stateStore.getState();
  assert.equal(state.canUndo, false);
  assert.equal(state.canRedo, false);
  assert.equal(stateStore.getPendingPrompt(), null);
  assert.equal(state.components.length, 0);
});

test("autosavePath points inside the configured project dir", () => {
  assert.equal(autosavePath(), path.join(tempDir, "autosave.prism.json"));
});
