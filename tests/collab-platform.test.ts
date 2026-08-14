import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { generatePage } from "../src/tools/generate-tools.js";
import { applyStyleTokenSet } from "../src/tokens.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("platform snapshots save, list, and restore per-platform pages", () => {
  applyStyleTokenSet(stateStore, undefined, "ai");
  stateStore.addComponent("hero", "centered", { title: "Web" }, null, "ai");
  stateStore.savePlatformSnapshot("web-desktop", "ai");

  stateStore.addComponent("sidebar", undefined, { title: "App" }, null, "ai");
  stateStore.addComponent("table", undefined, { columns: ["A"] }, null, "ai");
  stateStore.savePlatformSnapshot("desktop-macos", "ai");

  const platforms = stateStore.listPlatformSnapshots();
  assert.equal(platforms.length, 2);
  const macos = platforms.find((p) => p.platform === "desktop-macos");
  assert.equal(macos?.componentCount, 3);

  // Restore the web snapshot: sidebar/table disappear, hero stays
  stateStore.loadPlatformSnapshot("web-desktop", "ai");
  const types = stateStore.getState().components.map((c) => c.type);
  assert.deepEqual(types, ["hero"]);

  assert.throws(() => stateStore.loadPlatformSnapshot("mobile-ios", "ai"), /No saved design/);
});

test("comments attach to components and can be listed/removed", () => {
  applyStyleTokenSet(stateStore, undefined, "ai");
  const button = stateStore.addComponent("button", "primary", { text: "Go" }, null, "ai");

  const c1 = stateStore.addComment(button.id, "对比度偏低，建议加深主色", "designer", "user");
  const c2 = stateStore.addComment(button.id, "文案可以更明确", "pm", "user");
  assert.equal(stateStore.getState().comments.length, 2);
  assert.equal(c1.id.startsWith("cmt_"), true);

  assert.throws(() => stateStore.addComment("missing", "x"), /Component not found/);

  const removed = stateStore.removeComment(c1.id, "user");
  assert.equal(removed, true);
  const remaining = stateStore.getState().comments;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, c2.id);
  assert.equal(stateStore.removeComment("missing", "user"), false);
});

test("generatePage builds a matching template with semantic style", () => {
  const result = generatePage("电商促销首页，主打夏季大促", {
    style: "playful",
    adjectives: ["温暖", "简约"],
  });
  assert.equal(result.template, "ecommerce_home");
  assert.deepEqual(result.adjectives, ["温暖", "简约"]);
  assert.ok(result.component_ids.length >= 4, `expected >= 4 components, got ${result.component_ids.length}`);
  const state = stateStore.getState();
  const types = state.components.map((c) => c.type);
  assert.ok(types.includes("navbar") && types.includes("hero") && types.includes("footer"));
  assert.ok(Object.keys(state.tokens.colors).length > 0, "semantic style applied tokens");
  assert.ok(state.tokens.colors["color-primary"].description, "token carries semantic reason");
});

test("generatePage falls back to saas_landing for generic briefs", () => {
  const result = generatePage("做一个产品落地页", { style: "minimal" });
  assert.equal(result.template, "saas_landing");
  assert.ok(result.component_ids.length >= 5);
});
