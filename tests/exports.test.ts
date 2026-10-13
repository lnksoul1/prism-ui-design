import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { exportDesign } from "../src/tools/design-tools.js";
import { applyStyleTokenSet } from "../src/tokens.js";

beforeEach(() => {
  stateStore.resetForTests();
  stateStore.setProjectName("Export Test", "ai");
  applyStyleTokenSet(stateStore, "#06B6D4", "ai");
  stateStore.addComponent("navbar", "simple", { brand: "Prism" }, null, "ai");
  stateStore.addComponent("hero", "centered", { title: "Hello", subtitle: "world", button_text: "Go" }, null, "ai");
  stateStore.addComponent("stats", undefined, { items: [{ value: "100+", label: "Users" }] }, null, "ai");
});

test("flutter export produces a MaterialApp with token-derived theme", () => {
  const code = exportDesign("flutter");
  assert.match(code, /import 'package:flutter\/material.dart';/);
  assert.match(code, /MaterialApp/);
  assert.match(code, /colorSchemeSeed: kPrimary/);
  assert.match(code, /FilledButton/);
  assert.match(code, /const Color kPrimary = Color\(0xFF/);
});

test("variant classes on underscore component types match the exported stylesheet", () => {
  // Regression: `card_grid` + variant "3col" used to emit `card_grid--3col`
  // while every rule in the stylesheet is hyphenated (`.card-grid--3col`), so
  // the grid never applied and cards rendered as full-width stacked blocks.
  stateStore.addComponent(
    "card_grid",
    "3col",
    { title: "Products", items: [{ title: "A" }, { title: "B" }, { title: "C" }] },
    null,
    "ai"
  );
  const html = exportDesign("html");

  // The markup must use the hyphenated variant class...
  assert.match(html, /class="card-grid card-grid--3col"/);
  assert.doesNotMatch(html, /card_grid--/, "no underscore variant classes in the output");

  // ...and that class must actually be defined in the inlined stylesheet.
  const style = html.slice(html.indexOf("<style"), html.indexOf("</style>"));
  assert.match(style, /\.card-grid--3col\s*\{[^}]*grid-template-columns/);
});

test("tables are emitted inside a styled wrapper", () => {
  // Regression: `.table` had no CSS at all and the only `.table-wrap` rule had
  // nothing emitting that class, so exported tables were unstyled text.
  stateStore.addComponent(
    "table",
    "striped",
    { title: "Deploys", columns: ["Service", "Env"], rows: [["api", "prod"]] },
    null,
    "ai"
  );
  const html = exportDesign("html");
  assert.match(html, /<div class="table-wrap"><table class="table table--striped">/);

  const style = html.slice(html.indexOf("<style"), html.indexOf("</style>"));
  assert.match(style, /\.table\s*\{/, ".table base rule missing");
  assert.match(style, /\.table th, \.table td\s*\{[^}]*padding/, "table cell rule missing");
  assert.match(style, /\.table-wrap\s*\{[^}]*overflow-x/, ".table-wrap rule missing");
});

test("swiftui export produces a SwiftUI view with token colors", () => {
  const code = exportDesign("swiftui");
  assert.match(code, /import SwiftUI/);
  assert.match(code, /struct DesignPage: View/);
  assert.match(code, /Color\(hex: 0x/);
  assert.match(code, /Text\("Hello"\)/);
});

test("presentation export contains one slide per page", () => {
  stateStore.addPage("About", "ai");
  const code = exportDesign("presentation");
  const slides = code.match(/class="slide"/g) || [];
  assert.equal(slides.length, 2);
  assert.match(code, /window\.print/);
});

test("react-ts export includes typed props and tokens", () => {
  const code = exportDesign("react-ts");
  assert.match(code, /export interface DesignPageProps/);
  assert.match(code, /React\.JSX\.Element/);
  assert.match(code, /--color-primary:/);
});

test("svelte export produces an SFC with token CSS", () => {
  const code = exportDesign("svelte");
  assert.match(code, /<svelte:head>/);
  assert.match(code, /<style>/);
  assert.match(code, /--color-primary:/);
  assert.match(code, /export let title/);
});

test("HTML export escapes malicious props (XSS boundary, Phase 3.4)", () => {
  stateStore.resetForTests();
  stateStore.setProjectName("XSS Test", "ai");
  const payload = `<img src=x onerror=alert(1)><script>alert("pwned")</script>" ' `;
  stateStore.addComponent(
    "hero",
    "centered",
    {
      title: payload,
      subtitle: `"></div><script>alert(2)</script>`,
      button_text: `<svg onload=alert(3)>`,
      image_url: `" onerror="alert(4)`,
    },
    null,
    "ai"
  );
  stateStore.addComponent("navbar", "simple", { brand: `<script>alert(5)</script>` }, null, "ai");
  stateStore.addComponent("button", undefined, { text: `<script>alert(6)</script>` }, null, "ai");

  const code = exportDesign("html");
  // The raw payload must never appear unescaped.
  assert.ok(!code.includes("<script>alert("), "script tags must be escaped");
  assert.ok(!code.includes("<img src=x onerror"), "event handler attributes must be escaped");
  assert.ok(!code.includes("<svg onload"), "svg onload must be escaped");
  // Escaped entities must be present instead.
  assert.ok(code.includes("&lt;script&gt;"), "escaped script tag present");
  assert.ok(code.includes("&lt;img"), "escaped img present");
  assert.ok(code.includes("&lt;svg"), "escaped svg present");
  // Attribute-context quotes are escaped (double quotes).
  assert.ok(!code.includes('" onerror='), "attribute breakout prevented");
});

test("CSS-injection attempts cannot break out of the export stylesheet (Phase 3.4)", () => {
  stateStore.resetForTests();
  stateStore.setProjectName("CSS XSS Test", "ai");
  stateStore.addComponent(
    "alert",
    undefined,
    { text: "hello", type: "danger</style><script>alert(7)</script>" },
    null,
    "ai"
  );
  const code = exportDesign("html");
  assert.ok(!code.includes("</style><script>alert(7)"), "CSS breakout prevented in class attribute");
});

test("HTML export embeds mobile responsive rules (Phase 3.2)", () => {
  stateStore.resetForTests();
  stateStore.setProjectName("Responsive Test", "ai");
  stateStore.addComponent("card_grid", "3col", {
    items: [{ title: "A" }, { title: "B" }, { title: "C" }],
  }, null, "ai");
  stateStore.addComponent("navbar", "simple", { brand: "Brand" }, null, "ai");
  stateStore.addComponent("hero", "centered", { title: "Hi" }, null, "ai");
  const code = exportDesign("html");
  assert.match(code, /@media \(max-width: 480px\)/);
  assert.match(code, /\.card-grid--2col, \.card-grid--3col, \.card-grid--4col/);
  assert.match(code, /grid-template-columns: 1fr !important/);
  assert.match(code, /\.navbar \{ flex-wrap: wrap/);
});
