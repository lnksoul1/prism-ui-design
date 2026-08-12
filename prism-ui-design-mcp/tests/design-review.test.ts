import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  autoImprove,
  canonicalOrder,
  createBrandStyle,
  reflowPage,
  suggestImprovements,
} from "../src/tools/design-review.js";
import { applyStyleTokenSet } from "../src/tokens.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("suggestImprovements flags missing tokens and structure on an empty state", () => {
  const result = suggestImprovements();
  assert.ok(result.score < 100);
  assert.ok(
    result.suggestions.some((s) => s.severity === "critical" && s.title.includes("令牌")),
    "empty state should flag missing tokens"
  );
  assert.ok(result.suggestions.some((s) => s.title.includes("导航栏")));
  assert.ok(result.suggestions.every((s) => s.tool_hint.length > 0));
});

test("suggestImprovements gives fewer warnings on a complete page", () => {
  applyStyleTokenSet(stateStore, "minimal", undefined, "ai");
  stateStore.addComponent("navbar", "simple", { brand: "Logo" }, null, "ai");
  stateStore.addComponent("hero", "centered", { title: "Hi" }, null, "ai");
  stateStore.addComponent("cta", "centered", { title: "Go" }, null, "ai");
  stateStore.addComponent("footer", undefined, {}, null, "ai");
  const result = suggestImprovements();
  assert.ok(!result.suggestions.some((s) => s.severity === "critical"));
  assert.ok(!result.suggestions.some((s) => s.title.includes("缺少导航栏")));
  assert.ok(!result.suggestions.some((s) => s.title.includes("缺少首屏")));
});

test("createBrandStyle derives brand tokens with traceable reasons", () => {
  const result = createBrandStyle("Acme", ["#3366FF", "#FF5733"], { base_style: "minimal", radius_style: "rounded" });
  assert.ok(result.brand_hue >= 0 && result.brand_hue < 360, `brand hue out of range: ${result.brand_hue}`);
  assert.ok(result.decisions.length >= 8);
  const state = stateStore.getState();
  assert.equal(state.tokens.colors["color-primary"].value, "#3366FF");
  assert.equal(state.tokens.colors["color-accent"].value, "#FF5733");
  assert.ok(state.tokens.colors["color-primary"].description?.includes("Acme"));
  assert.ok(Object.keys(state.tokens.radii).length >= 5);
  assert.throws(() => createBrandStyle("Bad", ["not-a-color"], {}), /No valid hex colors/);
});

test("reflowPage orders sections canonically and records history", () => {
  applyStyleTokenSet(stateStore, "minimal", undefined, "ai");
  const footer = stateStore.addComponent("footer", undefined, {}, null, "ai");
  const hero = stateStore.addComponent("hero", "centered", { title: "H" }, null, "ai");
  const navbar = stateStore.addComponent("navbar", "simple", { brand: "L" }, null, "ai");
  assert.deepEqual(stateStore.getState().components.map((c) => c.type), ["footer", "hero", "navbar"]);

  const result = reflowPage();
  assert.equal(result.moved.length, 2);
  assert.deepEqual(stateStore.getState().components.map((c) => c.id), [navbar.id, hero.id, footer.id]);
  assert.equal(stateStore.canUndo(), true, "reflow should be undoable");

  const second = reflowPage();
  assert.equal(second.moved.length, 0, "second reflow should be a no-op");
});

test("canonicalOrder starts with navbar and ends with footer", () => {
  const order = canonicalOrder();
  assert.equal(order[0], "navbar");
  assert.equal(order[order.length - 1], "footer");
});

test("autoImprove generates tokens and fills missing structure on an empty state", () => {
  stateStore.setProjectName("Empty", "ai");
  stateStore.setStyle("tech", "ai");
  const result = autoImprove();
  const actions = result.actions.map((a) => a.action);
  assert.ok(actions.includes("apply_style_preset"), `actions: ${actions}`);
  assert.ok(actions.includes("add_navbar"));
  assert.ok(actions.includes("add_hero"));
  assert.ok(actions.includes("add_footer"));
  const state = stateStore.getState();
  const types = state.components.map((c) => c.type);
  assert.ok(types.includes("navbar") && types.includes("hero") && types.includes("footer"));
  assert.ok(Object.keys(state.tokens.colors).length > 0, "tokens generated");
});

test("autoImprove is a no-op on a complete page", () => {
  applyStyleTokenSet(stateStore, "minimal", undefined, "ai");
  stateStore.addComponent("navbar", "simple", { brand: "L" }, null, "ai");
  stateStore.addComponent("hero", "centered", { title: "H" }, null, "ai");
  stateStore.addComponent("footer", undefined, {}, null, "ai");
  const result = autoImprove();
  assert.equal(result.actions.length, 0);
});
