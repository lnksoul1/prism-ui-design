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
