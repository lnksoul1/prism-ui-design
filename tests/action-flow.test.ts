// tests/action-flow.test.ts（本任务先写模型/CRUD 部分，Task 10 再追加引擎用例）
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("action flows store", () => {
  test("addActionFlow stores and lists by component", () => {
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    const flow = stateStore.addActionFlow({
      id: "flow-1", name: "点击跳转", trigger: "click", componentId: node.id, enabled: true,
      steps: [{ id: "s1", action: "navigate", params: { page_id: stateStore.getState().currentPageId } }],
    }, "user");
    assert.equal(flow.id, "flow-1");
    assert.equal(stateStore.getActionFlows(node.id).length, 1);
    assert.equal(stateStore.getActionFlows().length, 1);
  });

  test("addActionFlow rejects unknown component or invalid step action", () => {
    assert.throws(() => stateStore.addActionFlow({
      id: "f", name: "x", trigger: "click", componentId: "nope", enabled: true, steps: [],
    }, "user"), /Component not found/);
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    assert.throws(() => stateStore.addActionFlow({
      id: "f", name: "x", trigger: "click", componentId: node.id, enabled: true,
      steps: [{ id: "s", action: "explode", params: {} }],
    } as never, "user"), /action/);
  });

  test("update/remove flows are undoable", () => {
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    stateStore.addActionFlow({
      id: "flow-1", name: "n", trigger: "click", componentId: node.id, enabled: true,
      steps: [{ id: "s1", action: "toast", params: { message: "hi" } }],
    }, "user");
    assert.equal(stateStore.updateActionFlow("flow-1", { enabled: false }, "user")?.enabled, false);
    assert.equal(stateStore.removeActionFlow("flow-1", "user"), true);
    assert.equal(stateStore.getState().actionFlows["flow-1"], undefined);
    stateStore.undo(); // 撤销 remove
    assert.ok(stateStore.getState().actionFlows["flow-1"]);
  });
});
