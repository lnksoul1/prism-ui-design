import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { importHtmlString } from "../src/import-project.js";

beforeEach(() => {
  stateStore.resetForTests();
});

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <nav><a href="/">Logo</a><a href="/pricing">Pricing</a></nav>
  <header>
    <h1>Hello World</h1>
    <p>Subtitle here</p>
    <a class="btn" href="#">Get Started</a>
  </header>
  <footer>© 2026 Prism</footer>
</body>
</html>
`;

test("importHtmlString extracts navbar, hero, and footer components", () => {
  const result = importHtmlString(SAMPLE_HTML, "sample.html", false);
  assert.ok(result.imported >= 3, `expected >= 3 components, got ${result.imported}`);
  assert.equal(result.pageName, "sample.html");
  assert.ok(result.pageId.startsWith("page_"));

  const state = stateStore.getState();
  const types = state.components.map((c) => c.type);
  assert.ok(types.includes("navbar"), `types: ${types}`);
  assert.ok(types.includes("footer"), `types: ${types}`);
});

test("importHtmlString clears existing state when requested", () => {
  stateStore.addComponent("card", undefined, { title: "old" }, null, "ai");
  const result = importHtmlString(SAMPLE_HTML, "fresh", true);
  assert.ok(result.imported >= 3);
  const state = stateStore.getState();
  assert.ok(state.components.every((c) => c.type !== "card"), "old components should be cleared");
});

test("importHtmlString throws when no components are recognizable", () => {
  assert.throws(() => importHtmlString("<p>just text</p>", "empty", false), /No recognizable UI components/);
});
