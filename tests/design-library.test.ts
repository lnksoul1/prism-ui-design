import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  applyDesignLibraryComponent,
  applyDesignStyle,
  listDesignComponents,
  listDesignStyles,
  listTermTemplates,
  loadDesignLibraryCatalog,
} from "../src/design-library.js";

beforeEach(() => {
  stateStore.resetForTests();
});

test("design library catalog exposes 24 styles, 117 components, and term templates", () => {
  const catalog = loadDesignLibraryCatalog();
  assert.equal(catalog.styles.length, 24);
  assert.equal(catalog.components.length, 117);
  assert.ok(catalog.termTemplates.length >= 2);
  assert.equal(catalog.source, "https://vibe-hub.org/topics/design");
});

test("listDesignStyles/listDesignComponents/listTermTemplates return clones", () => {
  const styles = listDesignStyles();
  const components = listDesignComponents();
  const terms = listTermTemplates();
  assert.equal(styles.length, 24);
  assert.equal(components.length, 117);
  assert.equal(terms.length >= 2, true);
  styles[0].id = "mutated";
  assert.notEqual(listDesignStyles()[0].id, "mutated");
});

test("applyDesignStyle sets state.style", () => {
  const styles = listDesignStyles();
  const styleId = styles.some((s) => s.id === "glass") ? "glass" : styles[0].id;
  const result = applyDesignStyle(styleId, "user");
  assert.equal(result.ok, true);
  assert.equal(result.style_id, styleId);
  const state = stateStore.getState();
  assert.equal(state.style, styleId);
});

test("applyDesignStyle rejects unknown style ids", () => {
  const result = applyDesignStyle("does-not-exist", "user");
  assert.equal(result.ok, false);
});

test("applyDesignLibraryComponent adds a component and replaces in place", () => {
  const components = listDesignComponents();
  assert.ok(components.length >= 2);
  const first = components.find((c) => c.type === "button") || components[0];
  const second = components.find((c) => c.type === "link") || components[1];
  const added = applyDesignLibraryComponent(first.id, null, "user");
  assert.equal(added.ok, true);
  assert.equal(added.mode, "added");
  const state1 = stateStore.getState();
  assert.equal(state1.components.length, 1);
  assert.equal(state1.components[0].type, first.type);

  const replaced = applyDesignLibraryComponent(second.id, added.component_id, "user");
  assert.equal(replaced.ok, true);
  assert.equal(replaced.mode, "replaced");
  assert.equal(replaced.component_id, added.component_id);
  const state2 = stateStore.getState();
  assert.equal(state2.components.length, 1);
  assert.equal(state2.components[0].id, added.component_id);
  assert.equal(state2.components[0].type, second.type);
});
