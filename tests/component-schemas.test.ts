import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPONENT_PROP_SCHEMAS,
  validateComponentProps,
  describeComponentProps,
} from "../src/component-schemas.js";

test("component schemas cover every known component type", () => {
  const expected = [
    "hero", "navbar", "card_grid", "card", "cta", "footer", "text_section",
    "feature_list", "button", "stats", "pricing", "testimonial", "banner",
    "timeline", "faq", "form", "image", "tabs", "accordion", "carousel",
    "modal", "sidebar", "breadcrumb", "pagination", "progress", "badge",
    "avatar", "input", "grid", "table", "alert", "tooltip", "bento_grid",
    "skeleton", "command_palette", "glass_card", "fab", "marquee",
    "feature_grid", "cookie_banner", "toggle", "text", "section", "container",
  ];
  for (const type of expected) {
    assert.ok(COMPONENT_PROP_SCHEMAS[type], `missing schema for ${type}`);
  }
});

test("validateComponentProps passes known fields and preserves unknown keys", () => {
  const props = validateComponentProps("hero", {
    title: "你好",
    subtitle: "副标题",
    custom_field: "kept",
  });
  assert.equal(props.title, "你好");
  assert.equal(props.custom_field, "kept", "unknown keys pass through");
});

test("validateComponentProps tolerates missing fields (lenient)", () => {
  const props = validateComponentProps("button", {});
  assert.deepEqual(props, {});
});

test("validateComponentProps keeps original props on shape mismatch (lenient fallback)", () => {
  const props = validateComponentProps("card_grid", { items: "not-an-array" });
  assert.equal(props.items, "not-an-array", "bad shapes are preserved, not dropped");
});

test("validateComponentProps normalizes nested item arrays for known shapes", () => {
  const props = validateComponentProps("feature_list", {
    items: [{ title: "A", description: "B" }],
  });
  assert.equal((props.items as Array<{ title: string }>)[0].title, "A");
});

test("unknown component types pass through untouched", () => {
  const props = validateComponentProps("mystery_type", { anything: 1 });
  assert.deepEqual(props, { anything: 1 });
});

test("describeComponentProps lists fields for known types", () => {
  const hero = describeComponentProps("hero");
  assert.ok(hero.includes("title"));
  assert.ok(hero.includes("button_text"));
  const unknown = describeComponentProps("nope");
  assert.equal(unknown, "");
});
