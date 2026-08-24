import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore, resolveAnimations, type ComponentNode } from "../src/state.js";
import { resolveStyle, isBreakpoint, BREAKPOINTS, type Breakpoint } from "../src/responsive.js";

beforeEach(() => {
  stateStore.resetForTests();
});

// findComponent is private on the store; tests read nodes through getState().
function findNode(id: string): ComponentNode | undefined {
  const search = (nodes: ComponentNode[]): ComponentNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = search(node.children || []);
      if (found) return found;
    }
    return undefined;
  };
  return search(stateStore.getState().components);
}

describe("resolveStyle", () => {
  test("desktop returns baseStyle only", () => {
    const node = { id: "a", type: "text", props: {}, children: [],
      baseStyle: { width: "100px", color: "#333" } } as never;
    assert.deepEqual(resolveStyle(node, "desktop"), { width: "100px", color: "#333" });
  });

  test("mobile merges diff over base", () => {
    const node = { id: "a", type: "text", props: {}, children: [],
      baseStyle: { width: "100px", color: "#333" },
      breakpointOverrides: { mobile: { width: "80px" } } } as never;
    assert.deepEqual(resolveStyle(node, "mobile"), { width: "80px", color: "#333" });
  });

  test("no baseStyle returns {}", () => {
    const node = { id: "a", type: "text", props: {}, children: [] } as never;
    assert.deepEqual(resolveStyle(node, "tablet"), {});
  });

  test("isBreakpoint / BREAKPOINTS", () => {
    assert.equal(isBreakpoint("mobile"), true);
    assert.equal(isBreakpoint("watch"), false);
    assert.deepEqual([...BREAKPOINTS], ["desktop", "tablet", "mobile"]);
  });
});

describe("stateStore breakpoint styles", () => {
  test("setBaseStyle + setBreakpointOverride round-trip", () => {
    const node = stateStore.addComponent("text", undefined, { text: "hi" }, null, "user");
    assert.equal(stateStore.setBaseStyle(node.id, { width: "100px" }, "user"), true);
    assert.equal(stateStore.setBreakpointOverride(node.id, "mobile", { width: "80px" }, "user"), true);
    const found = findNode(node.id);
    assert.deepEqual(found?.baseStyle, { width: "100px" });
    assert.deepEqual(found?.breakpointOverrides?.mobile, { width: "80px" });
    assert.equal(stateStore.setBaseStyle("nope", {}, "user"), false);
  });

  test("setBreakpointOverride merges into existing overrides", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    stateStore.setBreakpointOverride(node.id, "mobile", { width: "80px" }, "user");
    stateStore.setBreakpointOverride(node.id, "mobile", { color: "#f00" }, "user");
    const found = findNode(node.id);
    assert.deepEqual(found?.breakpointOverrides?.mobile, { width: "80px", color: "#f00" });
  });

  test("setBreakpointOverride rejects invalid breakpoint", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    assert.equal(stateStore.setBreakpointOverride(node.id, "watch" as unknown as Breakpoint, {}, "user"), false);
  });

  test("mutations are undoable", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    stateStore.setBaseStyle(node.id, { width: "100px" }, "user");
    stateStore.setBreakpointOverride(node.id, "mobile", { width: "80px" }, "user");
    stateStore.undo();
    assert.equal(findNode(node.id)?.breakpointOverrides, undefined);
    stateStore.undo();
    assert.equal(findNode(node.id)?.baseStyle, undefined);
  });
});

describe("timeline animations", () => {
  test("addTimelineAnimation appends a block and rejects unknown components", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const anim = stateStore.addTimelineAnimation(
      node.id,
      { trackId: "main", startTime: 0, duration: 300, preset: "fadeIn" },
      "user"
    );
    assert.ok(anim?.id);
    const found = findNode(node.id);
    assert.equal(found?.animations?.length, 1);
    assert.equal(found?.animations?.[0]?.preset, "fadeIn");
    assert.equal(
      stateStore.addTimelineAnimation("nope", { trackId: "main", startTime: 0, duration: 300, preset: "fadeIn" }, "user"),
      null
    );
  });

  test("resolveAnimations normalizes the legacy animation field onto the main track", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    stateStore.setAnimation(node.id, { entry: "slideIn", duration: 500, delay: 100 }, "user");
    const found = findNode(node.id);
    assert.ok(found);
    const anims = resolveAnimations(found);
    assert.equal(anims.length, 1);
    assert.equal(anims[0]?.preset, "slideIn");
    assert.equal(anims[0]?.trackId, "main");
    assert.equal(anims[0]?.startTime, 100);
    assert.equal(anims[0]?.duration, 500);
  });
});
