import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import { executeUserPrompt } from "../src/prompt-executor.js";

beforeEach(() => {
  stateStore.resetForTests();
  applyStyleTokenSet(stateStore, "#7C3AED", "ai");
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

test("applies a design system from natural language", () => {
  // 风格预设已移除：自然语言"XX风格"走品牌设计系统匹配（玻璃 → glassmorphism）。
  const result = executeUserPrompt("帮我换成玻璃拟态风格");
  assert.equal(result.executed, true);
  assert.equal(result.action, "apply_style_guide");
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

test("leaves unmatched instructions queued for the agent, with example suggestions", () => {
  const result = executeUserPrompt("帮我把配色优化得更高级一点");
  assert.equal(result.executed, false);
  assert.ok(Array.isArray(result.suggestions) && result.suggestions.length > 0);
  assert.ok(result.suggestions!.some((s) => s.includes("主色")));
});

test("unmatched English instructions also get English suggestions", () => {
  const result = executeUserPrompt("please make the whole thing feel more premium");
  assert.equal(result.executed, false);
  assert.ok(result.suggestions!.some((s) => s.includes("primary color")));
});

test("component styling: color targets the button, not the global token", () => {
  executeUserPrompt("添加一个按钮");
  const result = executeUserPrompt("把按钮改成蓝色");
  assert.equal(result.executed, true);
  assert.equal(result.action, "style_component");
  const comp = stateStore.getState().components[0];
  assert.equal(comp.type, "button");
  assert.equal(comp.props.color, "#3B82F6");
  // The global primary token must be untouched
  assert.notEqual(stateStore.getState().tokens.colors["color-primary"].value, "#3B82F6");
});

test("component styling: combined color + radius + font size", () => {
  executeUserPrompt("添加一个按钮");
  const result = executeUserPrompt("把按钮改成蓝色圆角 12 字号 18");
  assert.equal(result.executed, true);
  const props = stateStore.getState().components[0].props as Record<string, unknown>;
  assert.equal(props.color, "#3B82F6");
  assert.equal(props.radius, "12px");
  assert.equal(props.fontSize, "18px");
});

test("component styling: '按钮颜色改成…' still hits the component", () => {
  executeUserPrompt("添加一个按钮");
  const result = executeUserPrompt("按钮颜色改成绿色");
  assert.equal(result.executed, true);
  assert.equal(result.action, "style_component");
  assert.equal(stateStore.getState().components[0].props.color, "#22C55E");
  assert.notEqual(stateStore.getState().tokens.colors["color-primary"].value, "#22C55E");
});

test("component styling: background targets the component when named", () => {
  executeUserPrompt("添加一个卡片");
  const result = executeUserPrompt("卡片背景改成深蓝色");
  assert.equal(result.executed, true);
  const props = stateStore.getState().components[0].props as Record<string, unknown>;
  assert.equal(props.bg, "#1E3A8A");
  assert.notEqual(stateStore.getState().tokens.colors["color-bg"].value, "#1E3A8A");
});

test("component styling: no matching component falls back to the agent", () => {
  const result = executeUserPrompt("把按钮改成蓝色");
  assert.equal(result.executed, false);
  assert.match(result.summary, /没有「button」组件/);
});

test("component styling: '主色/primary' still forces the global token", () => {
  const result = executeUserPrompt("把主色改成红色");
  assert.equal(result.executed, true);
  assert.equal(result.action, "set_primary_color");
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, "#EF4444");
});

test("component styling: '添加一个按钮' still adds instead of styling", () => {
  const result = executeUserPrompt("添加一个按钮");
  assert.equal(result.executed, true);
  assert.equal(stateStore.getState().components[0].type, "button");
});

// ===== v2: everyday vocabulary for non-professionals =====

test("text edit: quoted title change updates component copy", () => {
  stateStore.addComponent("hero", undefined, { title: "旧标题" }, null, "ai");
  const result = executeUserPrompt("把标题改成「我们的新产品来了」");
  assert.equal(result.executed, true);
  assert.equal(result.action, "edit_text");
  assert.equal(stateStore.getState().components[0].props.title, "我们的新产品来了");
});

test("text edit: targets only the named component type", () => {
  stateStore.addComponent("hero", undefined, { title: "Hero" }, null, "ai");
  stateStore.addComponent("button", undefined, { text: "点击" }, null, "ai");
  const result = executeUserPrompt('把按钮文字改成 "立即购买"');
  assert.equal(result.executed, true);
  const components = stateStore.getState().components;
  const hero = components.find((c) => c.type === "hero");
  const button = components.find((c) => c.type === "button");
  assert.equal(hero!.props.title, "Hero", "hero must be untouched");
  assert.equal(button!.props.text, "立即购买");
});

test("text color: '把文字改成蓝色' sets the color-text token, not copy", () => {
  stateStore.addComponent("hero", undefined, { title: "Hero" }, null, "ai");
  const result = executeUserPrompt("把文字改成蓝色");
  assert.equal(result.executed, true);
  assert.equal(result.action, "set_text_color");
  assert.equal(stateStore.getState().tokens.colors["color-text"].value, "#3B82F6");
  assert.equal(stateStore.getState().components[0].props.title, "Hero");
});

test("font scale: '字太小了' increases the type tokens", () => {
  const before = parseFloat(stateStore.getState().tokens.typography["text-base"].value);
  const result = executeUserPrompt("字太小了，大一点");
  assert.equal(result.executed, true);
  const after = parseFloat(stateStore.getState().tokens.typography["text-base"].value);
  assert.ok(after > before, `expected ${after} > ${before}`);
});

test("absolute font size: '字号改成 20' rescales the type tokens", () => {
  const result = executeUserPrompt("字号改成 20");
  assert.equal(result.executed, true);
  const base = parseFloat(stateStore.getState().tokens.typography["text-base"].value);
  assert.ok(Math.abs(base - 1.25) < 0.06, `expected ~1.25rem, got ${base}`);
});

test("spacing: '间距更紧凑' tightens the spacing tokens", () => {
  const before = parseFloat(stateStore.getState().tokens.spacing["space-md"].value);
  const result = executeUserPrompt("间距更紧凑一点");
  assert.equal(result.executed, true);
  const after = parseFloat(stateStore.getState().tokens.spacing["space-md"].value);
  assert.ok(after < before, `expected ${after} < ${before}`);
});

test("radius: '改成直角' shrinks radii, '圆角大一点' grows them", () => {
  const before = parseFloat(stateStore.getState().tokens.radii["radius-md"].value);
  const sharp = executeUserPrompt("把圆角改成直角");
  assert.equal(sharp.executed, true);
  const sharpMid = parseFloat(stateStore.getState().tokens.radii["radius-md"].value);
  assert.ok(sharpMid < before, `expected ${sharpMid} < ${before}`);

  const round = executeUserPrompt("圆角大一点");
  assert.equal(round.executed, true);
  const roundMid = parseFloat(stateStore.getState().tokens.radii["radius-md"].value);
  assert.ok(roundMid > sharpMid, `expected ${roundMid} > ${sharpMid}`);
});

test("brightness: '整体调亮一点' lightens the background", () => {
  stateStore.setToken("colors", "color-bg", "#808080", "ai");
  const result = executeUserPrompt("整体调亮一点");
  assert.equal(result.executed, true);
  const after = stateStore.getState().tokens.colors["color-bg"].value;
  assert.notEqual(after, "#808080");
  assert.ok(parseInt(after.slice(1, 3), 16) > 0x80, `expected lighter than #808080, got ${after}`);
});

test("font switch: '换成衬线字体' moves to a serif pairing", () => {
  const result = executeUserPrompt("换成衬线字体");
  assert.equal(result.executed, true);
  assert.equal(result.action, "switch_font");
  assert.match(stateStore.getState().tokens.typography["font-display"].value, /serif/i);
});

test("contrast report: '检查一下对比度' reports without mutating", () => {
  const result = executeUserPrompt("检查一下对比度");
  assert.equal(result.executed, true);
  assert.equal(result.action, "check_contrast");
});

test("template on a non-empty page opens a fresh page instead of erroring", () => {
  executeUserPrompt("添加一个按钮");
  assert.equal(stateStore.getState().components.length, 1);
  const result = executeUserPrompt("生成一个电商模板");
  assert.equal(result.executed, true);
  assert.equal(result.action, "apply_template");
  const state = stateStore.getState();
  assert.equal(state.pages.length, 2);
  assert.ok(state.components.length >= 5, "template components land on the new page");
});

test("redo: '重做' restores an undone change", () => {
  executeUserPrompt("添加一个按钮");
  executeUserPrompt("撤销");
  assert.equal(stateStore.getState().components.length, 0);
  const result = executeUserPrompt("重做");
  assert.equal(result.executed, true);
  assert.equal(stateStore.getState().components.length, 1);
});

test("generic '大一点' scales both type and spacing", () => {
  const fontBefore = parseFloat(stateStore.getState().tokens.typography["text-base"].value);
  const spaceBefore = parseFloat(stateStore.getState().tokens.spacing["space-md"].value);
  const result = executeUserPrompt("整体大一点");
  assert.equal(result.executed, true);
  const fontAfter = parseFloat(stateStore.getState().tokens.typography["text-base"].value);
  const spaceAfter = parseFloat(stateStore.getState().tokens.spacing["space-md"].value);
  assert.ok(fontAfter > fontBefore && spaceAfter > spaceBefore);
});
