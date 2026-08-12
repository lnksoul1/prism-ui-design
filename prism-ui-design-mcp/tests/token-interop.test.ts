import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  applyImportedTokens,
  dtcgToTokenMaps,
  tokensToCss,
  tokensToDtcg,
  tokensToStyleDictionary,
} from "../src/tokens/dtcgi.js";

beforeEach(() => {
  stateStore.resetForTests();
});

function seedTokens() {
  stateStore.setToken("colors", "color-primary", "#7C3AED", "ai");
  stateStore.setToken("colors", "color-bg", "#FFFFFF", "ai");
  stateStore.setToken("spacing", "space-md", "1rem", "ai");
  stateStore.setToken("shadows", "shadow-md", "0 4px 6px rgba(0,0,0,0.1)", "ai");
}

test("tokensToDtcg produces $value/$type entries with prism source extensions", () => {
  seedTokens();
  const dtcg = tokensToDtcg(stateStore.getState().tokens);
  assert.equal(dtcg.colors["color-primary"].$type, "color");
  assert.equal(dtcg.colors["color-primary"].$value, "#7C3AED");
  assert.deepEqual(dtcg.colors["color-primary"].$extensions, { "prism.source": "ai" });
  assert.equal(dtcg.spacing["space-md"].$type, "dimension");
  assert.equal(dtcg.shadows["shadow-md"].$type, "shadow");
});

test("tokensToCss emits flat custom properties", () => {
  seedTokens();
  const css = tokensToCss(stateStore.getState().tokens);
  assert.match(css, /:root \{/);
  assert.match(css, /--color-primary: #7C3AED;/);
  assert.match(css, /--space-md: 1rem;/);
});

test("tokensToStyleDictionary nests category → token → value", () => {
  seedTokens();
  const sd = tokensToStyleDictionary(stateStore.getState().tokens);
  assert.deepEqual(sd.colors["color-primary"], { value: "#7C3AED" });
});

test("dtcgToTokenMaps accepts grouped and flat shapes", () => {
  const grouped = dtcgToTokenMaps({
    colors: { a: { $type: "color", $value: "#111111" }, b: "#222222" },
  });
  assert.deepEqual(grouped.colors, { a: "#111111", b: "#222222" });
  assert.throws(() => dtcgToTokenMaps({}), /No tokens found/);
  assert.throws(() => dtcgToTokenMaps("nope"), /Invalid tokens JSON/);
});

test("applyImportedTokens supports replace / merge-overwrite / merge-keep", () => {
  seedTokens();
  const incoming = {
    colors: { "color-primary": "#000000", "color-new": "#00FF00" },
  };

  applyImportedTokens(stateStore, incoming, { merge: "merge-keep" }, "user");
  const keep = stateStore.getState().tokens.colors;
  assert.equal(keep["color-primary"].value, "#7C3AED", "merge-keep must not overwrite");
  assert.equal(keep["color-new"].value, "#00FF00", "merge-keep must add new keys");

  applyImportedTokens(stateStore, incoming, { merge: "merge-overwrite" }, "user");
  const overwrite = stateStore.getState().tokens.colors;
  assert.equal(overwrite["color-primary"].value, "#000000");
  assert.ok(overwrite["color-bg"], "merge-overwrite keeps other keys");

  applyImportedTokens(stateStore, incoming, { merge: "replace" }, "user");
  const replaced = stateStore.getState().tokens.colors;
  assert.deepEqual(Object.keys(replaced), ["color-primary", "color-new"]);
});

test("round trip: state → dtcg → import restores values", () => {
  seedTokens();
  const dtcg = tokensToDtcg(stateStore.getState().tokens);
  stateStore.resetForTests();
  const maps = dtcgToTokenMaps(dtcg);
  applyImportedTokens(stateStore, maps, { merge: "replace" }, "user");
  const restored = stateStore.getState().tokens;
  assert.equal(restored.colors["color-primary"].value, "#7C3AED");
  assert.equal(restored.shadows["shadow-md"].value, "0 4px 6px rgba(0,0,0,0.1)");
});
