import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { buildTokenUsage } from "../src/token-usage.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("buildTokenUsage", () => {
  test("baseStyle value matching a token value is indexed", () => {
    stateStore.setToken("colors", "color-primary", "#1890ff", "user");
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    stateStore.setBaseStyle(node.id, { background: "#1890ff" }, "user");
    const usage = buildTokenUsage(stateStore.getState());
    assert.deepEqual(usage["colors.color-primary"], [node.id]);
  });

  test("breakpoint override and element css are scanned too", () => {
    stateStore.setToken("colors", "color-text", "#333333", "user");
    const a = stateStore.addComponent("text", undefined, {}, null, "user");
    stateStore.setBreakpointOverride(a.id, "mobile", { color: "#333333" }, "user");
    const b = stateStore.addComponent("card", undefined, {}, null, "user");
    stateStore.setElementMeta(b.id, "title", { css: { color: "#333333" } }, "user");
    const usage = buildTokenUsage(stateStore.getState());
    assert.deepEqual(usage["colors.color-text"].sort(), [a.id, b.id].sort());
  });

  test("unused tokens map to empty/absent entries", () => {
    stateStore.setToken("colors", "color-bg", "#ffffff", "user");
    const usage = buildTokenUsage(stateStore.getState());
    assert.deepEqual(usage["colors.color-bg"], []);
  });
});
