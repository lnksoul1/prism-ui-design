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

  test("51st version evicts v1 and promotes v2 to baseline, chain stays rebuildable", () => {
    const ids: string[] = [];
    for (let i = 1; i <= 51; i++) {
      stateStore.setProjectName(`name-${i}`, "user");
      if (i === 3) stateStore.addComponent("text", undefined, { text: "added at v3" }, null, "user");
      ids.push(createVersion(`v${i}`).id);
    }

    const stats = getInternalStorageStats();
    assert.equal(stats.entries.length, 50);
    assert.equal(stats.entries[0].id, ids[1]); // v1 被驱逐，v2 成为头部
    assert.equal(stats.entries[0].isBaseline, true); // 头部被提升为基线
    assert.equal(stats.entries[0].patchLength, 0);

    // 已驱逐的 v1 无法恢复
    assert.throws(() => restoreVersion(ids[0]), /Version not found/);

    // 最早仍存在的 v2 可精确还原（v3 之前：0 组件、name-2）
    restoreVersion(ids[1]);
    assert.equal(stateStore.getState().projectName, "name-2");
    assert.equal(stateStore.getState().components.length, 0);

    // 跨提升基线的中部版本也可精确还原
    restoreVersion(ids[30]);
    assert.equal(stateStore.getState().projectName, "name-31");
    assert.equal(stateStore.getState().components.length, 1);
  });

  test("createVersion after restore keeps the patch chain invariant", () => {
    stateStore.setProjectName("a", "user");
    const v1 = createVersion("v1");
    stateStore.setProjectName("b", "user");
    stateStore.addComponent("text", undefined, { text: "added after v1" }, null, "user");
    const v2 = createVersion("v2");

    // 回到早期版本后基于还原态继续修改
    restoreVersion(v1.id);
    assert.equal(stateStore.getState().projectName, "a");
    assert.equal(stateStore.getState().components.length, 0);
    stateStore.setProjectName("c", "user");
    const v3 = createVersion("v3");

    // restore 新版本：状态应精确还原为 v3 创建时的状态
    restoreVersion(v3.id);
    assert.equal(stateStore.getState().projectName, "c");
    assert.equal(stateStore.getState().components.length, 0);

    // 旧版本链条不受影响
    restoreVersion(v2.id);
    assert.equal(stateStore.getState().projectName, "b");
    assert.equal(stateStore.getState().components.length, 1);
  });
});
