// tests/layout-snap.test.ts
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { snapValue, snapToGrid } from "../src/layout/snap.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("snapValue", () => {
  test("rounds to nearest grid multiple", () => {
    assert.equal(snapValue(13, 8), 16);
    assert.equal(snapValue(12, 8), 8);
    assert.equal(snapValue(0, 8), 0);
    assert.equal(snapValue(-5, 8), -8);
    assert.equal(snapValue(100, 10), 100);
  });

  test("default grid is 8", () => {
    assert.equal(snapValue(7), 8);
  });
});

describe("snapToGrid", () => {
  test("returns per-node corrections", () => {
    const result = snapToGrid([
      { id: "a", layout: { x: 13, y: 21 } },
      { id: "b", layout: { x: 8, y: 8 } },
    ]);
    assert.deepEqual(result[0], { id: "a", from: { x: 13, y: 21 }, to: { x: 16, y: 24 } });
    assert.deepEqual(result[1], { id: "b", from: { x: 8, y: 8 }, to: { x: 8, y: 8 } });
  });

  test("nodes without layout default to 0,0", () => {
    const result = snapToGrid([{ id: "a" }]);
    assert.deepEqual(result[0].from, { x: 0, y: 0 });
  });
});

describe("stateStore.snapComponentsToGrid", () => {
  test("applies snapped coords as one undo step", () => {
    const a = stateStore.addComponent("text", undefined, {}, null, "user");
    const b = stateStore.addComponent("text", undefined, {}, null, "user");
    stateStore.updateComponent(a.id, {}, "user", { x: 13, y: 21, w: 100, h: 40 });
    stateStore.updateComponent(b.id, {}, "user", { x: 5, y: 5, w: 100, h: 40 });

    assert.equal(stateStore.snapComponentsToGrid([a.id, b.id], 8, "user"), true);
    const find = (id: string) => {
      const walk = (nodes: unknown[]): Record<string, unknown> | undefined => {
        for (const n of nodes as Array<Record<string, unknown>>) {
          if (n.id === id) return n;
          const f = walk((n.children || []) as Array<Record<string, unknown>>);
          if (f) return f;
        }
        return undefined;
      };
      return walk(stateStore.getState().components as unknown as Array<Record<string, unknown>>);
    };
    assert.equal((find(a.id)?.layout as { x: number }).x, 16);
    assert.equal((find(b.id)?.layout as { x: number }).x, 8);

    stateStore.undo();
    assert.equal((find(a.id)?.layout as { x: number }).x, 13);
    assert.equal((find(b.id)?.layout as { x: number }).x, 5);
  });

  test("returns false when no valid ids", () => {
    assert.equal(stateStore.snapComponentsToGrid(["nope"], 8, "user"), false);
  });
});

