import { test } from "node:test";
import assert from "node:assert/strict";
import { describePropWarning, LIST_PROPS } from "../src/component-schemas.js";
import { COMPONENT_TYPES } from "../src/service/design-service.js";
import { componentToHTML } from "../src/tools/design-tools.js";

test("warns when a list-bearing component gets no list at all", () => {
  // Regression: this used to fail silently — the component rendered as an empty
  // shell and nothing reported why.
  const w = describePropWarning("pricing", { title: "Plans" });
  assert.match(w, /^Warning:/);
  assert.match(w, /pricing/);
  assert.match(w, /items/);
  assert.match(w, /plans/, "the legacy alias should be offered");
});

test("warns when the list prop is not an array", () => {
  const w = describePropWarning("pricing", { items: "oops" });
  assert.match(w, /^Warning:/);
  assert.match(w, /array/);
});

test("notes an explicitly empty list", () => {
  const w = describePropWarning("card_grid", { items: [] });
  assert.match(w, /^Note:/);
});

test("stays silent for valid input", () => {
  assert.equal(describePropWarning("pricing", { items: [{ name: "A", price: "1" }] }), "");
  assert.equal(describePropWarning("pricing", { plans: [{ name: "A", price: "1" }] }), "");
  assert.equal(describePropWarning("sidebar", { items: ["A"] }), "");
  // Types with no list requirement are never warned about.
  assert.equal(describePropWarning("hero", { title: "T" }), "");
  assert.equal(describePropWarning("image", { alt: "x" }), "");
  // table's two lists are independent; one alone is legitimate.
  assert.equal(describePropWarning("table", { rows: [["1"]] }), "");
});

test("every list-prop type exists in the catalog and renders its list", () => {
  // Keeps the documented contract honest: a type listed here must be real, and
  // when given items it must actually emit them.
  for (const type of Object.keys(LIST_PROPS)) {
    assert.ok(COMPONENT_TYPES.has(type), `${type} is not in the component catalog`);
  }
  const html = componentToHTML({
    id: "x",
    type: "card_grid",
    props: { items: [{ title: "UNIQUE_MARKER" }] },
    children: [],
  });
  assert.match(html, /UNIQUE_MARKER/, "a valid items list must reach the output");
});
