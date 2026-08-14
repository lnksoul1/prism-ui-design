import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import { explainDesign, nameColor } from "../src/tools/explain-tools.js";

beforeEach(() => {
  stateStore.resetForTests();
  applyStyleTokenSet(stateStore, "minimal", "#7C3AED", "ai");
});

test("nameColor names colors the way non-designers do", () => {
  assert.equal(nameColor("#1E3A8A"), "深蓝");
  assert.equal(nameColor("#FF0000"), "鲜艳的红");
  assert.equal(nameColor("#F3F4F6"), "灰调蓝");
  assert.equal(nameColor("not-a-color"), "未知");
  assert.equal(nameColor(undefined), "未知");
});

test("explainDesign describes a minimal design in plain language", () => {
  stateStore.addComponent("hero", undefined, { title: "你好" }, null, "ai");
  const result = explainDesign("zh");
  assert.equal(result.style, "minimal");
  assert.equal(result.style_label, "简约");
  assert.equal(result.theme, "light");
  assert.match(result.primary_color, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(result.color_name.length > 0);
  assert.ok(result.summary.includes("简约"));
  assert.ok(result.facts.length >= 3);
  assert.ok(result.suggestions.length > 0);
  assert.ok(Array.isArray(result.personality));
});

test("explainDesign supports English output", () => {
  const result = explainDesign("en");
  assert.ok(result.summary.includes("minimal"));
  assert.ok(result.suggestions.some((s) => s.phrase.includes("primary color")));
});

test("explainDesign surfaces contrast conflicts", () => {
  // Force a low-contrast pair so the explanation warns the user.
  stateStore.setToken("colors", "color-bg", "#000000", "user");
  stateStore.setToken("colors", "color-text", "#111111", "user");
  const result = explainDesign("zh");
  assert.ok(result.conflicts.length > 0, "conflicts should be surfaced");
  assert.ok(result.summary.includes("对比度"));
});

test("explainDesign is read-only", () => {
  const before = JSON.stringify(stateStore.getState());
  explainDesign("zh");
  explainDesign("en");
  assert.equal(JSON.stringify(stateStore.getState()), before);
});
