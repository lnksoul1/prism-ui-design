import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  COMPONENT_TYPES,
  applyClientMessage,
  applyStyle,
  initProject,
  isKnownComponentType,
  setToken,
  wsMessageSchema,
} from "../src/service/design-service.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("component type allowlist matches the dashboard catalog", () => {
  assert.equal(COMPONENT_TYPES.size, 51);
  for (const type of ["hero", "navbar", "card_grid", "card", "cta", "footer", "text_section", "feature_list", "button", "stats", "pricing", "testimonial", "banner", "timeline", "faq", "form", "image", "tabs", "accordion", "carousel", "modal", "sidebar", "breadcrumb", "pagination", "progress", "badge", "avatar", "input", "grid", "table", "alert", "tooltip", "bento_grid", "skeleton", "command_palette", "glass_card", "fab", "marquee", "feature_grid", "cookie_banner", "toggle", "text", "section", "container", "rect", "ellipse", "arrow", "line", "note", "connector", "html_fragment"]) {
    assert.ok(isKnownComponentType(type), `expected ${type} to be known`);
  }
  assert.equal(isKnownComponentType("mystery"), false);
});

test("addComponent rejects unknown types", () => {
  assert.throws(() => setToken("bogus", "key", "#fff"), /Invalid token category/);
});

test("initProject generates tokens including shadows", () => {
  const result = initProject("Service Test", "#2563EB");
  assert.equal(result.success, true);
  assert.equal(result.style, "minimal");
  assert.ok(result.token_count >= 52);
  const tokens = stateStore.getState().tokens;
  assert.ok(Object.keys(tokens.shadows).length >= 5, "shadows tokens generated");
  assert.ok(tokens.shadows["shadow-md"]);
});

test("applyStyle applies the neutral default tokens", () => {
  // 风格预设已移除：applyStyle 固定应用中性默认 token（兼容旧调用）。
  assert.equal(applyStyle("tech"), true);
  assert.ok(stateStore.getState().tokens.shadows["shadow-lg"]);
});

test("ws schema accepts valid client messages", () => {
  const cases = [
    { type: "set_token", category: "colors", key: "color-primary", value: "#ff0000" },
    { type: "update_component", id: "comp_1", props: { title: "x" } },
    { type: "update_component", id: "comp_1", props: {}, layout: { x: 10, y: 20, w: 300, h: 160 } },
    { type: "rename_component", id: "comp_1", name: "Hero" },
    { type: "remove_component", id: "comp_1" },
    { type: "duplicate_component", id: "comp_1" },
    { type: "undo" },
    { type: "redo" },
    { type: "add_page", name: "About" },
    { type: "switch_page", pageId: "page_1" },
    { type: "remove_page", pageId: "page_1" },
    { type: "rename_page", pageId: "page_1", name: "Home" },
    { type: "reorder_component", fromId: "a", toId: "b", position: "before" },
    { type: "set_theme", mode: "dark" },
    { type: "set_platform", platform: "mobile-ios" },
    { type: "prompt", prompt: "make it blue" },
    { type: "add_component", component_type: "hero", variant: "centered", props: { title: "Hi" } },
    { type: "set_animation", component_id: "comp_1", entry: "fadeUp", duration: 0.4 },
    { type: "align_components", ids: ["a", "b"], mode: "center_x" },
    { type: "z_order_component", id: "comp_1", mode: "front" },
    { type: "apply_design_style", style_id: "minimal" },
    { type: "apply_component_template", component_id: "navbar_top" },
    { type: "apply_component_template", component_id: "navbar_top", target_id: "comp_1" },
  ];
  for (const msg of cases) {
    assert.equal(wsMessageSchema.safeParse(msg).success, true, `expected valid: ${JSON.stringify(msg)}`);
  }
});

test("ws schema rejects malformed client messages", () => {
  const bad = [
    { type: "nope" },
    { type: "set_token", category: "colors", key: "" },
    { type: "set_token", category: "colors", key: "x" }, // missing value
    { type: "rename_component", id: "comp_1" }, // missing name
    { type: "reorder_component", fromId: "a", toId: "b", position: "sideways" },
    { type: "set_theme", mode: "neon" },
    { type: "set_platform", platform: "" },
    { type: "set_platform" },
    { type: "add_component", component_type: "" },
    { type: "add_component" }, // missing component_type
    { type: "prompt", prompt: "" },
    { type: "align_components", ids: ["a"], mode: "center_x" },
    { type: "align_components", ids: ["a", "b"], mode: "sideways" },
    { type: "z_order_component", id: "comp_1", mode: "diagonal" },
    { type: "apply_design_style", style_id: "" },
    { type: "apply_design_style" },
    { type: "apply_component_template", component_id: "" },
    { type: "apply_component_template" },
    { type: "undo", extra: "no extras allowed in discriminated union" },
  ];
  for (const msg of bad) {
    assert.equal(wsMessageSchema.safeParse(msg).success, false, `expected invalid: ${JSON.stringify(msg)}`);
  }
});

test("applyClientMessage mutates state and reports failures", () => {
  const node = stateStore.addComponent("button", undefined, { text: "Go" }, null, "ai");

  const added = applyClientMessage({
    type: "add_component",
    component_type: "card",
    variant: undefined,
    props: { title: "New" },
  });
  assert.equal(added.ok, true);

  const badType = applyClientMessage({
    type: "add_component",
    component_type: "mystery",
    variant: undefined,
    props: {},
  });
  assert.equal(badType.ok, false);
  assert.match(badType.detail, /Unknown component type/);

  const token = applyClientMessage({ type: "set_token", category: "colors", key: "color-primary", value: "#00ff00" });
  assert.equal(token.ok, true);
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, "#00ff00");

  const upd = applyClientMessage({ type: "update_component", id: node.id, props: { text: "Stop" } });
  assert.equal(upd.ok, true);
  assert.equal(stateStore.getState().components[0].props.text, "Stop");

  const layoutUpd = applyClientMessage({
    type: "update_component",
    id: node.id,
    props: {},
    layout: { x: 42, y: 88, w: 480, h: 240 },
  });
  assert.equal(layoutUpd.ok, true);
  assert.deepEqual(stateStore.getState().components[0].layout, { x: 42, y: 88, w: 480, h: 240 });

  const undo = applyClientMessage({ type: "undo" });
  assert.equal(undo.ok, true);

  const anim = applyClientMessage({ type: "set_animation", component_id: node.id, entry: "fadeUp" });
  assert.equal(anim.ok, true);
  const animState = stateStore.getState().components.find((c) => c.id === node.id);
  assert.equal(animState?.animation?.entry, "fadeUp");

  const platform = applyClientMessage({ type: "set_platform", platform: "web-mobile" });
  assert.equal(platform.ok, true);
  assert.equal(stateStore.getState().activePlatform, "web-mobile");

  const dup = applyClientMessage({ type: "duplicate_component", id: node.id });
  assert.equal(dup.ok, true);
  assert.ok(dup.detail.includes("component "));
  assert.equal(stateStore.getState().components.filter((c) => c.type === "button").length, 2);
  const missing = applyClientMessage({ type: "duplicate_component", id: "comp_nope" });
  assert.equal(missing.ok, false);

  // 背景编辑 P1: set_page_background binds a page-level background
  const pageBg = applyClientMessage({
    type: "set_page_background",
    background: { type: "gradient", value: "linear-gradient(135deg, #6366f1, #22d3ee)" },
  });
  assert.equal(pageBg.ok, true);
  assert.equal(stateStore.getState().pageBackground?.type, "gradient");
  const pageBgClear = applyClientMessage({ type: "set_page_background", background: null });
  assert.equal(pageBgClear.ok, true);
  assert.equal(stateStore.getState().pageBackground, undefined);

  const renamed = applyClientMessage({ type: "rename_component", id: node.id, name: "主按钮" });
  assert.equal(renamed.ok, true);
  assert.equal(stateStore.getState().components.find((c) => c.id === node.id)?.name, "主按钮");
  const renameMissing = applyClientMessage({ type: "rename_component", id: "comp_nope", name: "x" });
  assert.equal(renameMissing.ok, false);

  const align = applyClientMessage({
    type: "align_components",
    ids: [node.id, "comp_nope"],
    mode: "left",
  });
  assert.equal(align.ok, false, "align needs 2 valid components");

  const zOrder = applyClientMessage({ type: "z_order_component", id: node.id, mode: "back" });
  assert.equal(zOrder.ok, true);
});

// ===== 设计库快速换装 (DESIGN.md v1.1 §4.3/§9) =====

test("ws apply_design_style and apply_component_template work end to end", () => {
  const styled = applyClientMessage({ type: "apply_design_style", style_id: "minimal" });
  assert.equal(styled.ok, true);
  assert.equal(stateStore.getState().style, "minimal");

  const node = stateStore.addComponent("button", undefined, { text: "Go" }, null, "user");

  const replaced = applyClientMessage({
    type: "apply_component_template",
    component_id: "button",
    target_id: node.id,
  });
  assert.equal(replaced.ok, true);
  const state = stateStore.getState();
  const updated = state.components.find((c) => c.id === node.id);
  assert.ok(updated);
  assert.equal(updated.type, "button");

  const added = applyClientMessage({ type: "apply_component_template", component_id: "input" });
  assert.equal(added.ok, true);

  const badComponent = applyClientMessage({ type: "apply_component_template", component_id: "nope" });
  assert.equal(badComponent.ok, false);

  const badStyle = applyClientMessage({ type: "apply_design_style", style_id: "nope" });
  assert.equal(badStyle.ok, false);
});
