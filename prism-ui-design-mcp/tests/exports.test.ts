import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { exportDesign } from "../src/tools/design-tools.js";
import { applyStyleTokenSet } from "../src/tokens.js";

beforeEach(() => {
  stateStore.resetForTests();
  stateStore.setProjectName("Export Test", "ai");
  applyStyleTokenSet(stateStore, "tech", "#06B6D4", "ai");
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
