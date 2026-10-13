import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { canonicalOrder, suggestImprovements } from "../src/tools/design-review-suggest.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("suggestImprovements flags missing tokens and structure on an empty state", () => {
  const result = suggestImprovements();
  assert.ok(result.score < 100);
  const titles = result.suggestions.map((s) => s.title).join(" | ");
  assert.match(titles, /导航栏|hero|Hero/);
});

test("suggestImprovements gives fewer warnings on a complete page", () => {
  stateStore.addComponent("navbar", "simple", { brand: "Acme", links: ["A"] }, null, "user");
  stateStore.addComponent("hero", "centered", { title: "Hi", subtitle: "Sub" }, null, "user");
  stateStore.addComponent("footer", "simple", { copyright: "©" }, null, "user");

  const empty = suggestImprovements();
  assert.ok(typeof empty.score === "number");
  assert.ok(empty.score >= 0 && empty.score <= 100);
});

test("canonicalOrder starts with navbar and ends with footer", () => {
  const order = canonicalOrder();
  assert.equal(order[0], "navbar");
  assert.equal(order[order.length - 1], "footer");
});
