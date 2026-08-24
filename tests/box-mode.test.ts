// tests/box-mode.test.ts
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { BOX_MODE_TYPES, isBoxModeType } from "../src/box-mode.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("box-mode constants", () => {
  test("contains chart-like complex types", () => {
    assert.ok(BOX_MODE_TYPES.includes("chart"));
    assert.ok(BOX_MODE_TYPES.includes("rich_text"));
  });
  test("isBoxModeType guard", () => {
    assert.equal(isBoxModeType("chart"), true);
    assert.equal(isBoxModeType("button"), false);
  });
});

describe("stateStore.setBoxMode", () => {
  test("enables box mode with internal config", () => {
    const node = stateStore.addComponent("chart", undefined, {}, null, "user");
    assert.equal(
      stateStore.setBoxMode(
        node.id,
        { enabled: true, internalConfig: { option: { series: [] } } },
        "user"
      ),
      true
    );
    const found = stateStore.getState().components.find((c) => c.id === node.id);
    assert.deepEqual(found?.boxMode, { enabled: true, internalConfig: { option: { series: [] } } });
  });

  test("partial patch keeps existing internalConfig keys", () => {
    const node = stateStore.addComponent("chart", undefined, {}, null, "user");
    stateStore.setBoxMode(node.id, { enabled: true, internalConfig: { theme: "dark" } }, "user");
    stateStore.setBoxMode(node.id, { internalConfig: { theme: "light" } }, "user");
    const found = stateStore.getState().components.find((c) => c.id === node.id);
    assert.equal(found?.boxMode?.enabled, true);
    assert.equal(found?.boxMode?.internalConfig?.theme, "light");
  });

  test("returns false for unknown component", () => {
    assert.equal(stateStore.setBoxMode("nope", { enabled: true }, "user"), false);
  });

  test("undo reverts box mode change", () => {
    const node = stateStore.addComponent("chart", undefined, {}, null, "user");
    stateStore.setBoxMode(node.id, { enabled: true }, "user");
    stateStore.undo();
    const found = stateStore.getState().components.find((c) => c.id === node.id);
    assert.equal(found?.boxMode, undefined);
  });
});
