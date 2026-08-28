// tests/action-flow.test.ts（本任务先写模型/CRUD 部分，Task 10 再追加引擎用例）
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { runActionFlow, type ActionFlow } from "../src/action-flow.js";

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

describe("runActionFlow engine", () => {
  const flow = (steps: ActionFlow["steps"], enabled = true): ActionFlow => ({
    id: "f", name: "t", trigger: "click", componentId: "comp", steps, enabled,
  });
  const ctx = {
    hasPage: (id: string) => id === "p2",
    hasComponent: (id: string) => id === "comp",
  };

  test("executes steps sequentially and returns effects", () => {
    const r = runActionFlow(flow([
      { id: "s1", action: "toast", params: { message: "hi" } },
      { id: "s2", action: "navigate", params: { page_id: "p2" } },
      { id: "s3", action: "delay", params: { ms: 500 } },
    ]), ctx);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.effects.map((e) => e.type), ["toast", "navigate", "delay"]);
    assert.deepEqual(r.effects[1], { type: "navigate", pageId: "p2" });
  });

  test("stops at first invalid step with collected error", () => {
    const r = runActionFlow(flow([
      { id: "s1", action: "toast", params: { message: "hi" } },
      { id: "s2", action: "navigate", params: { page_id: "missing" } },
      { id: "s3", action: "toast", params: { message: "never" } },
    ]), ctx);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /unknown page/);
    assert.deepEqual(r.effects.map((e) => e.type), ["toast"]);
  });

  test("disabled flow and invalid url are rejected", () => {
    assert.deepEqual(runActionFlow(flow([], false), ctx).effects, []);
    const r = runActionFlow(flow([{ id: "s", action: "openUrl", params: { url: "javascript:alert(1)" } }]), ctx);
    assert.match(r.errors[0], /url/);
  });
});
