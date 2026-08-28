import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("M3 pin comments", () => {
  test("addComment stores pin coordinates and assignee", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const c = stateStore.addComment(node.id, "这里字太小", "alice", "user", { x: 24, y: 16, assignee: "bob" });
    assert.equal(c.x, 24);
    assert.equal(c.y, 16);
    assert.equal(c.assignee, "bob");
    assert.equal(c.resolved, undefined);
  });

  test("updateComment resolves and reassigns", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const c = stateStore.addComment(node.id, "改一下", "alice", "user");
    const updated = stateStore.updateComment(c.id, { resolved: true, assignee: "carol" }, "user");
    assert.equal(updated?.resolved, true);
    assert.equal(updated?.assignee, "carol");
    assert.ok(updated?.updatedAt);
  });

  test("updateComment returns null for unknown id and is undoable", () => {
    assert.equal(stateStore.updateComment("nope", { resolved: true }, "user"), null);
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const c = stateStore.addComment(node.id, "x", "alice", "user");
    stateStore.updateComment(c.id, { resolved: true }, "user");
    stateStore.undo();
    const restored = stateStore.getState().comments.find((x) => x.id === c.id);
    assert.equal(restored?.resolved, undefined);
  });
});
