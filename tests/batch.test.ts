// tests/batch.test.ts
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { runBatch } from "../src/commands/batch.js";

function findComp(id: string): { layout?: { x: number; y: number }; name?: string } | undefined {
  const walk = (nodes: Array<Record<string, unknown>>): Record<string, unknown> | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = walk((n.children || []) as Array<Record<string, unknown>>);
      if (found) return found;
    }
    return undefined;
  };
  return walk(stateStore.getState().components as unknown as Array<Record<string, unknown>>) as
    | { layout?: { x: number; y: number }; name?: string }
    | undefined;
}

beforeEach(() => {
  stateStore.resetForTests();
});

describe("runBatch", () => {
  test("merges 3 mutations into a single undo step", () => {
    const a = stateStore.addComponent("text", undefined, { text: "a" }, null, "user");
    const b = stateStore.addComponent("text", undefined, { text: "b" }, null, "user");

    runBatch("move-many", () => {
      stateStore.updateComponent(a.id, {}, "user", { x: 32, y: 64 });
      stateStore.updateComponent(b.id, {}, "user", { x: 48, y: 128 });
      stateStore.renameComponent(a.id, "renamed", "user");
    });

    assert.equal(findComp(a.id)?.layout?.x, 32);
    assert.equal(findComp(a.id)?.name, "renamed");
    assert.equal(findComp(b.id)?.layout?.y, 128);

    stateStore.undo();
    // 三处变更一次性回滚
    assert.notEqual(findComp(a.id)?.layout?.x, 32);
    assert.notEqual(findComp(a.id)?.name, "renamed");
    assert.notEqual(findComp(b.id)?.layout?.y, 128);

    stateStore.redo();
    assert.equal(findComp(a.id)?.layout?.x, 32);
    assert.equal(findComp(a.id)?.name, "renamed");
  });

  test("failure rolls back all partial mutations and rethrows", () => {
    const before = JSON.stringify(stateStore.getState().components);
    assert.throws(
      () =>
        runBatch("boom", () => {
          stateStore.addComponent("text", undefined, { text: "x" }, null, "user");
          stateStore.addComponent("text", undefined, { text: "y" }, null, "user");
          throw new Error("boom");
        }),
      /boom/
    );
    assert.equal(JSON.stringify(stateStore.getState().components), before);
    // 回滚后历史未受污染：undo 应回到 batch 前的上一状态或返回 false
    assert.equal(stateStore.canUndo(), false);
  });

  test("nested batches flatten to one undo step", () => {
    const a = stateStore.addComponent("text", undefined, { text: "a" }, null, "user");
    runBatch("outer", () => {
      stateStore.updateComponent(a.id, {}, "user", { x: 10 });
      runBatch("inner", () => {
        stateStore.updateComponent(a.id, {}, "user", { y: 20 });
      });
    });
    assert.equal(findComp(a.id)?.layout?.x, 10);
    assert.equal(findComp(a.id)?.layout?.y, 20);
    stateStore.undo();
    assert.notEqual(findComp(a.id)?.layout?.x, 10);
    assert.notEqual(findComp(a.id)?.layout?.y, 20);
  });

  test("non-batched mutation still commits individually", () => {
    const a = stateStore.addComponent("text", undefined, { text: "a" }, null, "user");
    stateStore.updateComponent(a.id, {}, "user", { x: 5 });
    stateStore.undo();
    assert.notEqual(findComp(a.id)?.layout?.x, 5);
  });
});
