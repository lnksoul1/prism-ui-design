import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  applySemanticStyle,
  normalizeAdjectives,
  resolveAdjective,
} from "../src/semantics.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("resolveAdjective supports Chinese and English terms", () => {
  assert.ok(resolveAdjective("温暖"));
  assert.ok(resolveAdjective("warm"));
  assert.equal(resolveAdjective("not-a-word"), undefined);
});

test("normalizeAdjectives dedupes and skips unknown terms", () => {
  const out = normalizeAdjectives(["温暖", "warm", "温暖", "???"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].term, "温暖");
});

test("applySemanticStyle applies adjusted tokens with traceable reasons", () => {
  const result = applySemanticStyle("温暖的落地页", ["温暖", "简约"], "minimal");
  assert.equal(result.base_style, "minimal");
  assert.deepEqual(result.adjectives, ["温暖", "简约"]);
  assert.ok(result.decisions.length >= 5, "should produce color/radius/shadow/font decisions");
  assert.ok(result.summary.includes("温暖"));

  const state = stateStore.getState();
  const primary = state.tokens.colors["color-primary"];
  assert.ok(primary.value.startsWith("#"));
  assert.ok(primary.description, "primary token should carry a reason");
  assert.ok(primary.description!.includes("色相"), `reason should explain the hue shift: ${primary.description}`);
  assert.ok(Object.keys(state.tokens.radii).length >= 5);
  assert.ok(Object.keys(state.tokens.shadows).length >= 5);
});

test("applySemanticStyle throws when no adjectives are recognized", () => {
  assert.throws(() => applySemanticStyle("desc", ["zzz"]), /No recognized adjectives/);
});

test("applySemanticStyle shifts the project's current primary instead of replacing it", () => {
  // Regression: the tool used to fall back to a neutral hue-220 default whenever
  // the caller did not pass base_color, silently overwriting a brand colour with
  // blue. Adjectives must adjust whatever primary the project already has.
  stateStore.setToken("colors", "color-primary", "#8B5E3C", "user"); // warm brown
  const before = stateStore.getState().tokens.colors["color-primary"].value;

  applySemanticStyle("温暖的落地页", ["温暖"]);

  const after = stateStore.getState().tokens.colors["color-primary"].value;
  assert.notEqual(after, before, "a hue-shifting adjective should move the colour");
  // Still in the warm half of the wheel — not reset to a neutral/blue default.
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(after);
  assert.ok(m, `expected a hex colour, got ${after}`);
  const r = parseInt(m![1], 16);
  const b = parseInt(m![3], 16);
  assert.ok(r > b, `expected a warm colour (r>b) after「温暖」, got ${after}`);
});

test("an explicit base_color still wins over the current primary", () => {
  stateStore.setToken("colors", "color-primary", "#8B5E3C", "user"); // warm brown
  applySemanticStyle("x", ["科技"], "tech", "#06B6D4"); // explicit cyan
  const after = stateStore.getState().tokens.colors["color-primary"].value;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(after)!;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  // Cyan is "cool": blue/green dominate red. (Hue shifts can land on teal, so
  // assert dominance rather than blue>green.)
  assert.ok(g > r && b > r, `expected a cool colour (green and blue above red), got ${after}`);
});

test("semantic style is idempotent and deterministic", () => {
  const a = applySemanticStyle("x", ["科技"], "tech", "#06B6D4");
  const b = applySemanticStyle("x", ["科技"], "tech", "#06B6D4");
  assert.equal(a.base_color, b.base_color);
  assert.deepEqual(a.decisions, b.decisions);
});
