import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  STYLE_GUIDES,
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
