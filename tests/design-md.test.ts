import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  parseDesignMd,
  tokensToDesignMd,
} from "../src/tokens/dtcgi.js";
import { applyImportedTokens } from "../src/tokens/dtcgi.js";

beforeEach(() => {
  stateStore.resetForTests();
});

function seed() {
  stateStore.setToken("colors", "color-primary", "#7C3AED", "ai");
  stateStore.setToken("colors", "color-bg", "#FFFFFF", "ai");
  stateStore.setToken("spacing", "space-md", "1rem", "ai");
  stateStore.setToken("radii", "radius-md", "8px", "ai");
}

test("tokensToDesignMd produces YAML front matter with token groups", () => {
  seed();
  const md = tokensToDesignMd(stateStore.getState().tokens, "Brand");
  assert.match(md, /^---/);
  assert.match(md, /name: Brand/);
  assert.match(md, /color-primary: '#7C3AED'|color-primary: "#7C3AED"/);
  assert.match(md, /space-md:/);
});

test("parseDesignMd round-trips tokens and extracts prose", () => {
  seed();
  const md = tokensToDesignMd(stateStore.getState().tokens, "Brand", "Use these tokens consistently.");
  const doc = parseDesignMd(md);
  assert.equal(doc.prose, "Use these tokens consistently.");
  assert.equal(doc.tokens.colors?.["color-primary"], "#7C3AED");
  assert.equal(doc.tokens.spacing?.["space-md"], "1rem");
  assert.equal(doc.tokens.radii?.["radius-md"], "8px");
});

test("parseDesignMd rejects missing front matter", () => {
  assert.throws(() => parseDesignMd("# no front matter"), /missing YAML front matter/);
  assert.throws(() => parseDesignMd("---\nfoo: bar\n---\n"), /no recognized token groups/);
});

test("design_md → import restores tokens", () => {
  seed();
  const md = tokensToDesignMd(stateStore.getState().tokens, "Brand");
  const doc = parseDesignMd(md);
  stateStore.resetForTests();
  const count = applyImportedTokens(stateStore, doc.tokens, { merge: "replace" }, "user");
  assert.equal(count, 4);
  assert.equal(stateStore.getState().tokens.colors["color-primary"].value, "#7C3AED");
});
