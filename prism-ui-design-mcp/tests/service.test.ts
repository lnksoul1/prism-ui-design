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
  assert.equal(COMPONENT_TYPES.size, 41);
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
    { type: "remove_component", id: "comp_1" },
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
    { type: "apply_style", style: "minimal" },
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
    { type: "reorder_component", fromId: "a", toId: "b", position: "sideways" },
    { type: "set_theme", mode: "neon" },
    { type: "set_platform", platform: "" },
    { type: "set_platform" },
    { type: "add_component", component_type: "" },
    { type: "add_component" }, // missing component_type
    { type: "prompt", prompt: "" },
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
});
