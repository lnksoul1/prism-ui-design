import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { componentToHTML, exportDesign } from "../src/tools/design-tools.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import { COMPONENT_TYPES } from "../src/service/design-service.js";

beforeEach(() => {
  stateStore.resetForTests();
  stateStore.setProjectName("Export Test", "ai");
  applyStyleTokenSet(stateStore, "#06B6D4", "ai");
});

const stylesheet = (html: string): string => html.slice(html.indexOf("<style"), html.indexOf("</style>"));

test("component types that need layout have a root CSS rule", () => {
  // Regression: `.bento`, `.grid` and `.toggle` had no base rule at all, so a
  // variant could set grid-template-columns on an element that was never a grid.
  // These are the container/layout types; the rest either map to a
  // different class (.bento-grid -> .bento, .button -> .btn) or are structural
  // wrappers with no styling of their own.
  for (const type of COMPONENT_TYPES) {
    stateStore.addComponent(type, undefined, {}, null, "ai");
  }
  const css = stylesheet(exportDesign("html"));

  for (const cls of ["bento", "grid"]) {
    assert.match(css, new RegExp("\\." + cls + "\\s*\\{"), `.${cls} has no base rule`);
  }
  assert.match(css, /\.grid\s*\{[^}]*display:\s*grid/, ".grid must be a grid container");
  assert.match(css, /\.bento\s*\{[^}]*display:\s*grid/, ".bento must be a grid container");
});

test("a variant rule targets the element that actually carries the class", () => {
  // Regression: `.testimonial--grid .testimonials` used a descendant selector
  // while both classes sit on the same element, so the grid never applied.
  const html = componentToHTML({
    id: "x",
    type: "testimonial",
    variant: "grid",
    props: { items: [{ name: "n", quote: "q" }] },
    children: [],
  });
  const cls = (html.match(/class="([^"]*)"/) || [])[1] ?? "";
  assert.ok(cls.includes("testimonial--grid"), "container carries the variant class");
  assert.ok(cls.includes("testimonials"), "and the base class");

  const css = stylesheet(exportDesign("html"));
  assert.match(
    css,
    /\.testimonials\.testimonial--grid\s*\{[^}]*display:\s*grid/,
    "the grid rule must be a compound selector on the same element"
  );
  assert.doesNotMatch(
    css,
    /\.testimonial--grid\s+\.testimonials\s*\{/,
    "a descendant selector can never match here"
  );
});

test("variant rules stay inside the stylesheet template literal", () => {
  // Regression guard: a backtick inside a CSS comment terminated the enclosing
  // template literal and broke the build.
  const css = stylesheet(exportDesign("html"));
  assert.ok(css.length > 1000, "stylesheet should be substantial");
  assert.ok(!css.includes("${"), "no un-interpolated template markers leaked into the CSS");
});
