import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  STYLE_GUIDES,
  BRAND_DESIGN_SYSTEMS,
  applyStyleGuide,
  matchStyleGuide,
  radiusSetFor,
  shadowSetFor,
} from "../src/style-guides.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("matchStyleGuide matches by id, name, and keywords", () => {
  assert.equal(matchStyleGuide("glassmorphism")?.id, "glassmorphism");
  assert.equal(matchStyleGuide("毛玻璃")?.id, "glassmorphism");
  assert.equal(matchStyleGuide("brutalist")?.id, "brutalist");
  assert.equal(matchStyleGuide("不存在"), undefined);
});

test("applyStyleGuide applies token overrides on top of a base preset", () => {
  const result = applyStyleGuide("brutalist", "minimal");
  assert.equal(result.guide_id, "brutalist");
  assert.equal(result.base_style, "minimal");
  assert.ok(result.overrides.length > 0);

  const state = stateStore.getState();
  assert.equal(state.tokens.radii["radius-md"].value, "0px", "brutalist should zero the radius");
  assert.equal(state.tokens.shadows["shadow-md"].value.includes("6px 6px 0"), true);
  assert.ok(state.tokens.colors["color-primary"].value, "base preset tokens generated");
});

test("applyStyleGuide rejects unknown tags", () => {
  assert.throws(() => applyStyleGuide("nope"), /Unknown style guide/);
});

test("radiusSetFor and shadowSetFor produce full named sets", () => {
  const radii = radiusSetFor("pill");
  assert.ok(radii["radius-full"] === "9999px");
  assert.ok(parseInt(radii["radius-lg"]) >= 16);
  const shadows = shadowSetFor("sharp");
  assert.equal(Object.keys(shadows).length, 5);
  assert.ok(shadows["shadow-2xl"]);
});

test("style guide catalog covers the documented guides", () => {
  const ids = STYLE_GUIDES.map((g) => g.id);
  for (const id of ["glassmorphism", "brutalist", "retro", "neumorphism", "cyberpunk", "editorial"]) {
    assert.ok(ids.includes(id), `missing guide ${id}`);
  }
});

test("brand design systems are exposed and route through the same applier", () => {
  const ids = BRAND_DESIGN_SYSTEMS.map((s) => s.id);
  for (const id of [
    "linear", "stripe", "vercel", "notion", "arc", "spotify",
    "apple", "github", "ibm-carbon", "shopify-polaris", "duolingo",
    "discord", "raycast", "airbnb", "figma", "anthropic", "linear-light",
  ]) {
    assert.ok(ids.includes(id), `missing brand system ${id}`);
  }
  // Every brand system defines a primary + background so the preview card works
  for (const sys of BRAND_DESIGN_SYSTEMS) {
    assert.ok(sys.tokens.colors?.["color-primary"], `${sys.id} missing color-primary`);
    assert.ok(sys.tokens.colors?.["color-bg"], `${sys.id} missing color-bg`);
  }
  // Brand systems are matchable/applicable like any style guide
  assert.equal(matchStyleGuide("linear")?.id, "linear");
  assert.equal(matchStyleGuide("apple")?.id, "apple");
  const result = applyStyleGuide("stripe", "minimal");
  assert.equal(result.guide_id, "stripe");
  const state = stateStore.getState();
  assert.equal(state.tokens.colors["color-primary"].value, "#635BFF");
});

test("applying a brand design system is undoable", () => {
  applyStyleGuide("minimal", "minimal");
  const before = stateStore.getState().tokens.colors["color-primary"].value;
  applyStyleGuide("spotify", "minimal");
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, "#1DB954");
  let guard = 0;
  while (
    stateStore.getState().tokens.colors["color-primary"].value !== before &&
    stateStore.canUndo() &&
    guard < 60
  ) {
    stateStore.undo();
    guard++;
  }
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, before);
});
