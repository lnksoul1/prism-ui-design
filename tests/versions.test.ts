import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  clearVersionsForTests,
  createVersion,
  diffVersions,
  listVersions,
  restoreVersion,
  versionCount,
} from "../src/versions.js";
import { applyStyleTokenSet } from "../src/tokens.js";

beforeEach(() => {
  stateStore.resetForTests();
  clearVersionsForTests();
});

afterEach(() => {
  clearVersionsForTests();
});

test("createVersion snapshots current state and lists newest first", () => {
  stateStore.setProjectName("Versions", "ai");
  stateStore.addComponent("hero", "centered", { title: "V1" }, null, "ai");
  const v1 = createVersion("First");

  stateStore.addComponent("footer", undefined, {}, null, "ai");
  const v2 = createVersion("Second");

  assert.equal(versionCount(), 2);
  const listed = listVersions();
  assert.equal(listed.length, 2);
  assert.equal(listed[0].name, "Second");
  assert.equal(listed[1].name, "First");
  assert.equal(listed[1].componentCount, 1);
  assert.equal(v1.id !== v2.id, true);
});

test("restoreVersion reverts components and tokens", () => {
  applyStyleTokenSet(stateStore, "minimal", "#4A6FA5", "ai");
  const primaryBefore = stateStore.getState().tokens.colors["color-primary"].value;
  stateStore.addComponent("button", "primary", { text: "A" }, null, "ai");
  const v1 = createVersion("Before");

  stateStore.removeComponent(stateStore.getState().components[0].id, "ai");
  stateStore.setToken("colors", "color-primary", "#FF0000", "user");
  assert.equal(stateStore.getState().components.length, 0);

  restoreVersion(v1.id);
  const state = stateStore.getState();
  assert.equal(state.components.length, 1);
  assert.equal(state.components[0].props.text, "A");
  assert.equal(state.tokens.colors["color-primary"].value, primaryBefore);
});

test("restoreVersion throws for unknown ids", () => {
  assert.throws(() => restoreVersion("nope"), /Version not found/);
});

test("diffVersions reports added/removed/modified and token changes", () => {
  stateStore.addComponent("navbar", undefined, { brand: "X" }, null, "ai");
  const v1 = createVersion("Base");

  stateStore.addComponent("card", undefined, { title: "New" }, null, "ai");
  const navbar = stateStore.getState().components.find((c) => c.type === "navbar")!;
  stateStore.updateComponent(navbar.id, { brand: "Y" }, "ai");
  stateStore.setToken("colors", "color-primary", "#123456", "user");
  const v2 = createVersion("After");

  const diff = diffVersions(v1.id, v2.id);
  assert.equal(diff.components_added, 1);
  assert.equal(diff.components_modified, 1);
  assert.equal(diff.components_removed, 0);
  assert.ok(diff.token_changes >= 1);
  assert.ok(diff.summary.some((l) => l.includes("Components")));

  assert.throws(() => diffVersions("missing", v2.id), /not found/);
});
