import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { createVersion, listVersions, restoreVersion, getInternalStorageStats, resetVersionsForTests } from "../src/versions.js";

beforeEach(() => {
  stateStore.resetForTests();
  resetVersionsForTests();
});

describe("JSON Patch versioning", () => {
  test("restore returns to the earlier version state", () => {
    stateStore.setProjectName("v1-name", "user");
    const v1 = createVersion("v1");
    stateStore.setProjectName("v2-name", "user");
    stateStore.addComponent("text", undefined, { text: "added after v1" }, null, "user");
    const v2 = createVersion("v2");

    restoreVersion(v1.id);
    assert.equal(stateStore.getState().projectName, "v1-name");
    assert.equal(stateStore.getState().components.length, 0);

    restoreVersion(v2.id);
    assert.equal(stateStore.getState().projectName, "v2-name");
    assert.equal(stateStore.getState().components.length, 1);
  });

  test("non-baseline versions store patches, not full snapshots", () => {
    stateStore.setProjectName("base", "user");
    createVersion("baseline-1"); // 第 1 个版本即基线
    stateStore.setProjectName("changed", "user");
    const v2 = createVersion("v2"); // 应存 patch
    const stats = getInternalStorageStats();
    const entry = stats.entries.find((e: { id: string }) => e.id === v2.id) as { isBaseline: boolean; patchLength: number };
    assert.equal(entry.isBaseline, false);
    assert.ok(entry.patchLength > 0);
    assert.ok(entry.patchLength < 10); // 一个 rename 的 patch 很小
  });

  test("every 20th version is a new baseline", () => {
    for (let i = 1; i <= 21; i++) {
      stateStore.setProjectName(`name-${i}`, "user");
      createVersion(`v${i}`);
    }
    const stats = getInternalStorageStats();
    assert.equal(stats.entries.filter((e: { isBaseline: boolean }) => e.isBaseline).length, 2); // v1 和 v21
  });

  test("listVersions still returns meta without internals", () => {
    stateStore.setProjectName("x", "user");
    createVersion("only");
    const list = listVersions();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "only");
    assert.equal("snapshot" in list[0], false);
  });
});
