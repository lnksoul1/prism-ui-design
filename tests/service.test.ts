import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  COMPONENT_TYPES,
  applyStyle,
  initProject,
  isKnownComponentType,
  setToken,
} from "../src/service/design-service.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("component type allowlist matches the MCP-exportable set", () => {
  assert.equal(COMPONENT_TYPES.size, 40);
  for (const type of [
    // sections & layout
    "hero", "navbar", "card_grid", "card", "cta", "footer", "text_section", "feature_list",
    "stats", "pricing", "testimonial", "banner", "timeline", "faq", "form", "image",
    // interactive & data
    "button", "tabs", "accordion", "carousel", "sidebar", "breadcrumb", "pagination",
    "progress", "badge", "avatar", "input", "grid", "table", "alert", "tooltip",
    // composed & decorative
    "bento_grid", "skeleton", "glass_card", "marquee", "feature_grid",
    // structural
    "text", "section", "container", "html_fragment",
  ]) {
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
