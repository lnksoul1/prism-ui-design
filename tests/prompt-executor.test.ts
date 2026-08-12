import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import { executeUserPrompt } from "../src/prompt-executor.js";

beforeEach(() => {
  stateStore.resetForTests();
  applyStyleTokenSet(stateStore, "minimal", "#7C3AED", "ai");
});

test("changes the primary color from a natural-language instruction", () => {
  const result = executeUserPrompt("把主色改成蓝色");
  assert.equal(result.executed, true);
  assert.equal(result.action, "set_primary_color");
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, "#3B82F6");
});

test("supports hex colors and background color", () => {
  const hex = executeUserPrompt("主色改成 #FF5500");
  assert.equal(hex.executed, true);
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, "#FF5500");

  const bg = executeUserPrompt("把背景色改成浅灰 #F3F4F6");
  assert.equal(bg.action, "set_bg_color");
  assert.equal(stateStore.getState().tokens.colors["color-bg"].value, "#F3F4F6");
});

test("switches theme modes", () => {
  const dark = executeUserPrompt("切换到深色模式");
  assert.equal(dark.executed, true);
  assert.equal(stateStore.getState().themeMode, "dark");

  const light = executeUserPrompt("light mode please");
  assert.equal(light.executed, true);
  assert.equal(stateStore.getState().themeMode, "light");
});

test("applies a style preset", () => {
  const result = executeUserPrompt("帮我换成玻璃拟态风格");
  assert.equal(result.executed, true);
  assert.equal(result.action, "apply_style");
  const tokens = stateStore.getState().tokens;
  assert.ok(Object.keys(tokens.colors).length > 0, "style tokens should be regenerated");
});

test("generates a page template when the page is empty", () => {
  const result = executeUserPrompt("生成一个 saas 落地页模板");
  assert.equal(result.executed, true);
  assert.equal(result.action, "apply_template");
  assert.ok(stateStore.getState().components.length >= 5);
});

test("adds a component and supports undo", () => {
  const added = executeUserPrompt("添加一个按钮");
  assert.equal(added.executed, true);
  assert.equal(stateStore.getState().components[0].type, "button");

  const undone = executeUserPrompt("撤销");
  assert.equal(undone.executed, true);
  assert.equal(stateStore.getState().components.length, 0);
});

test("clears the design", () => {
  executeUserPrompt("添加一个卡片");
  const cleared = executeUserPrompt("清空设计");
  assert.equal(cleared.executed, true);
  assert.equal(stateStore.getState().components.length, 0);
});

test("leaves unmatched instructions queued for the agent", () => {
  const result = executeUserPrompt("帮我把配色优化得更高级一点");
  assert.equal(result.executed, false);
  assert.equal(result.summary, "");
});
