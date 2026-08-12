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

test("semantic style is idempotent and deterministic", () => {
  const a = applySemanticStyle("x", ["科技"], "tech", "#06B6D4");
  const b = applySemanticStyle("x", ["科技"], "tech", "#06B6D4");
  assert.equal(a.base_color, b.base_color);
  assert.deepEqual(a.decisions, b.decisions);
});
