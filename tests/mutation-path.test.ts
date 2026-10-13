import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stateStore } from "../src/state.js";
import { addComponent, setProjectName, setToken } from "../src/service/design-service.js";

/**
 * The service is the single validated mutation path. These tests keep that true:
 * a tool that calls a store mutator directly would bypass the component-type
 * allowlist, the prop schemas and the token-category check.
 */

/** Store methods that mutate state and therefore must go through the service. */
const MUTATORS = [
  "addComponent", "updateComponent", "renameComponent", "removeComponent",
  "duplicateComponent", "reorderComponent", "replaceComponent",
  "setToken", "setTokenBatch", "deleteToken", "clearTokenCategory",
  "addPage", "switchPage", "removePage", "renamePage", "moveComponentToPage",
  "alignComponents", "zOrderComponent", "reparentComponent",
  "groupComponents", "ungroupComponents", "moveArrayItem",
  "setAnimation", "setBehavior", "setElementMeta", "setPageBackground",
  "setThemeMode", "setPlatform", "setProjectName", "setStyle",
  "clearAll", "setImport", "setBaseStyle", "setBoxMode",
];

function toolFiles(): string[] {
  const dir = path.resolve("src/tools");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => path.join(dir, f));
}

test("no tool calls a stateStore mutator directly", () => {
  const offenders: string[] = [];
  for (const file of toolFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of MUTATORS) {
      const re = new RegExp(`stateStore\\.${m}\\s*\\(`);
      if (re.test(text)) offenders.push(`${path.basename(file)}: stateStore.${m}()`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `tools must mutate through design-service, not stateStore:\n${offenders.join("\n")}`
  );
});

test("the service is what enforces the component-type allowlist", () => {
  // Behavioural counterpart to the static check: going through the service
  // rejects an unknown type, which a direct store call would not.
  assert.throws(() => addComponent("not_a_real_type", undefined, {}, null, "ai"), /Unknown component type/);
});

test("the service is what enforces token categories", () => {
  assert.throws(() => setToken("nonsense", "k", "#fff", "ai"), /Invalid token category/);
});

test("service mutations still reach the store", () => {
  stateStore.resetForTests();
  setProjectName("Service Test", "ai");
  const node = addComponent("hero", "centered", { title: "T" }, null, "ai");
  assert.equal(stateStore.getState().projectName, "Service Test");
  assert.ok(stateStore.getState().components.some((c) => c.id === node.id));
});
