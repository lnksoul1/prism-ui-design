import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  COMPONENT_TYPES,
  applyBehaviorTemplate,
  applyClientMessage,
  applyComponentTemplate,
  applyStyle,
  initProject,
  isKnownComponentType,
  setToken,
  wsMessageSchema,
} from "../src/service/design-service.js";
import {
  BEHAVIOR_TEMPLATES,
  COMPONENT_TEMPLATES,
  getBehaviorTemplate,
  getComponentTemplate,
  listBehaviorTemplates,
  listComponentTemplates,
} from "../src/template-catalog.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("component type allowlist matches the dashboard catalog", () => {
  assert.equal(COMPONENT_TYPES.size, 44);
  for (const type of ["hero", "navbar", "card_grid", "card", "cta", "footer", "text_section", "feature_list", "button", "stats", "pricing", "testimonial", "banner", "timeline", "faq", "form", "image", "tabs", "accordion", "carousel", "modal", "sidebar", "breadcrumb", "pagination", "progress", "badge", "avatar", "input", "grid", "table", "alert", "tooltip", "bento_grid", "skeleton", "command_palette", "glass_card", "fab", "marquee", "feature_grid", "cookie_banner", "toggle"]) {
    assert.ok(isKnownComponentType(type), `expected ${type} to be known`);
  }
  assert.equal(isKnownComponentType("mystery"), false);
});

test("addComponent rejects unknown types", () => {
  assert.throws(() => setToken("bogus", "key", "#fff"), /Invalid token category/);
});

test("initProject generates tokens including shadows", () => {
  const result = initProject("Service Test", "bold", "#2563EB");
  assert.equal(result.success, true);
  assert.equal(result.style, "bold");
  assert.ok(result.token_count >= 52);
  const tokens = stateStore.getState().tokens;
  assert.ok(Object.keys(tokens.shadows).length >= 5, "shadows tokens generated");
  assert.ok(tokens.shadows["shadow-md"]);
});

test("applyStyle returns false for unknown styles", () => {
  assert.equal(applyStyle("not-a-style"), false);
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
    { type: "set_behavior", component_id: "comp_1", behavior: { type: "navigate", page_id: "page_2" } },
    { type: "set_behavior", component_id: "comp_1", behavior: null },
    { type: "align_components", ids: ["a", "b"], mode: "center_x" },
    { type: "z_order_component", id: "comp_1", mode: "front" },
    { type: "apply_style", style: "minimal" },
    { type: "apply_component_template", template_id: "hero_split_cta" },
    { type: "apply_component_template", template_id: "pricing_3col", target_id: "comp_1" },
    { type: "apply_behavior_template", component_id: "comp_1", template_id: "toast_feedback" },
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
    { type: "set_behavior", component_id: "comp_1", behavior: { type: "teleport" } },
    { type: "align_components", ids: ["a"], mode: "center_x" },
    { type: "align_components", ids: ["a", "b"], mode: "sideways" },
    { type: "z_order_component", id: "comp_1", mode: "diagonal" },
    { type: "apply_component_template", template_id: "" },
    { type: "apply_behavior_template", component_id: "comp_1", template_id: "" },
    { type: "apply_behavior_template", template_id: "toast_feedback" },
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

  const beh = applyClientMessage({
    type: "set_behavior",
    component_id: node.id,
    behavior: { type: "toast", message: "已加入购物车" },
  });
  assert.equal(beh.ok, true);
  const behState = stateStore.getState().components.find((c) => c.id === node.id);
  assert.deepEqual(behState?.behavior, { type: "toast", message: "已加入购物车" });

  const clearBeh = applyClientMessage({ type: "set_behavior", component_id: node.id, behavior: null });
  assert.equal(clearBeh.ok, true);
  assert.equal(stateStore.getState().components.find((c) => c.id === node.id)?.behavior, undefined);

  const behMissing = applyClientMessage({
    type: "set_behavior",
    component_id: "comp_nope",
    behavior: { type: "prompt", prompt: "x" },
  });
  assert.equal(behMissing.ok, false);

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

// ===== 模板快速变更 (v3.2 支柱⑦ P0) =====

test("template catalog exposes curated component and behavior templates", () => {
  assert.ok(COMPONENT_TEMPLATES.length >= 8, "component templates catalog non-trivial");
  assert.ok(BEHAVIOR_TEMPLATES.length >= 6, "behavior templates catalog non-trivial");

  const blocks = listComponentTemplates();
  const behaviors = listBehaviorTemplates();
  assert.equal(blocks.length, COMPONENT_TEMPLATES.length);
  assert.equal(behaviors.length, BEHAVIOR_TEMPLATES.length);

  const hero = getComponentTemplate("hero_split_cta");
  assert.ok(hero);
  assert.equal(hero.type, "hero");
  assert.ok(hero.props.title);
  assert.equal(getComponentTemplate("nope"), undefined);

  const toast = getBehaviorTemplate("toast_feedback");
  assert.ok(toast);
  assert.deepEqual(toast.build({ currentPageId: null, pageIds: [] }), { type: "toast", message: "操作成功！" });
  assert.equal(getBehaviorTemplate("nope"), undefined);
});

test("applyComponentTemplate adds a block when no target is given", () => {
  const result = applyComponentTemplate("hero_split_cta", null, "user");
  assert.equal(result.ok, true);
  assert.equal(result.mode, "added");
  assert.ok(result.component_id);
  const state = stateStore.getState();
  const node = state.components.find((c) => c.id === result.component_id);
  assert.ok(node);
  assert.equal(node.type, "hero");
  assert.equal(node.variant, "split");
  assert.equal(node.props.title, "你的产品标题");
});

test("applyComponentTemplate replaces a component in place and keeps layout", () => {
  const original = stateStore.addComponent("button", undefined, { text: "Go" }, null, "user");
  stateStore.updateComponent(original.id, {}, "user", { x: 10, y: 20, w: 200, h: 48 });

  const result = applyComponentTemplate("signup_form", original.id, "user");
  assert.equal(result.ok, true);
  assert.equal(result.mode, "replaced");
  assert.equal(result.component_id, original.id);

  const state = stateStore.getState();
  const node = state.components.find((c) => c.id === original.id);
  assert.ok(node);
  assert.equal(node.type, "form");
  assert.equal(node.variant, "signup");
  assert.deepEqual(node.layout, { x: 10, y: 20, w: 200, h: 48 }, "layout position preserved");
  assert.deepEqual(node.behavior, { type: "submit", form_id: "signup" }, "preset behavior bound");
});

test("applyComponentTemplate falls back to adding when the target is missing", () => {
  const result = applyComponentTemplate("cta_banner", "comp_nope", "user");
  assert.equal(result.ok, true);
  assert.equal(result.mode, "added");
  assert.ok(result.component_id);
});

test("applyComponentTemplate rejects unknown template ids", () => {
  const result = applyComponentTemplate("nope", null, "user");
  assert.equal(result.ok, false);
  assert.match(result.detail || "", /Unknown component template/);
});

test("applyBehaviorTemplate binds a preset interaction", () => {
  const node = stateStore.addComponent("button", undefined, { text: "Go" }, null, "user");
  const result = applyBehaviorTemplate(node.id, "toast_feedback", node.id, "user");
  assert.equal(result.ok, true);
  assert.equal(result.component_id, node.id);
  assert.deepEqual(result.behavior, { type: "toast", message: "操作成功！" });

  const state = stateStore.getState();
  const updated = state.components.find((c) => c.id === node.id);
  assert.deepEqual(updated?.behavior, { type: "toast", message: "操作成功！" });
});

test("applyBehaviorTemplate navigate_home resolves the first page", () => {
  const firstPage = stateStore.getState().pages[0];
  const node = stateStore.addComponent("button", undefined, { text: "Go" }, null, "user");
  const result = applyBehaviorTemplate(node.id, "navigate_home", node.id, "user");
  assert.equal(result.ok, true);
  assert.equal(result.behavior?.type, "navigate");
  assert.equal(result.behavior?.page_id, firstPage.id);
});

test("applyBehaviorTemplate rejects unknown templates and missing components", () => {
  const node = stateStore.addComponent("button", undefined, { text: "Go" }, null, "user");
  const unknown = applyBehaviorTemplate(node.id, "nope", node.id, "user");
  assert.equal(unknown.ok, false);
  assert.match(unknown.detail || "", /Unknown behavior template/);

  const missing = applyBehaviorTemplate("comp_nope", "toast_feedback", null, "user");
  assert.equal(missing.ok, false);
});

test("ws apply_component_template and apply_behavior_template work end to end", () => {
  const node = stateStore.addComponent("button", undefined, { text: "Go" }, null, "user");

  const replaced = applyClientMessage({
    type: "apply_component_template",
    template_id: "pricing_3col",
    target_id: node.id,
  });
  assert.equal(replaced.ok, true);
  const state = stateStore.getState();
  const updated = state.components.find((c) => c.id === node.id);
  assert.equal(updated?.type, "pricing");

  const behaved = applyClientMessage({
    type: "apply_behavior_template",
    component_id: node.id,
    template_id: "open_link_new_tab",
  });
  assert.equal(behaved.ok, true);
  const withBehavior = stateStore.getState().components.find((c) => c.id === node.id);
  assert.equal(withBehavior?.behavior?.type, "link");
  assert.equal(withBehavior?.behavior?.new_tab, true);

  const badTemplate = applyClientMessage({
    type: "apply_component_template",
    template_id: "nope",
  });
  assert.equal(badTemplate.ok, false);
});
