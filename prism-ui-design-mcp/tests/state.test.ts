import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("undo / redo", () => {
  test("fresh store has no undo/redo history", () => {
    assert.equal(stateStore.canUndo(), false);
    assert.equal(stateStore.canRedo(), false);
    assert.equal(stateStore.undo(), false);
    assert.equal(stateStore.redo(), false);
  });

  test("mutation enables undo, undo restores, redo re-applies", () => {
    stateStore.setProjectName("Alpha", "ai");
    assert.equal(stateStore.canUndo(), true);
    assert.equal(stateStore.undo(), true);
    assert.equal(stateStore.getState().projectName, "Untitled Project");
    assert.equal(stateStore.canRedo(), true);
    assert.equal(stateStore.redo(), true);
    assert.equal(stateStore.getState().projectName, "Alpha");
  });

  test("new mutation after undo clears redo history", () => {
    stateStore.setProjectName("Alpha", "ai");
    stateStore.undo();
    stateStore.setProjectName("Beta", "ai");
    assert.equal(stateStore.canRedo(), false);
  });

  test("history is capped at 50 steps", () => {
    for (let i = 0; i < 55; i++) {
      stateStore.addComponent("hero", undefined, {}, null, "ai");
    }
    let undoCount = 0;
    while (stateStore.canUndo()) {
      assert.equal(stateStore.undo(), true);
      undoCount++;
    }
    // The 50-snapshot cap includes the initial state, so 49 undo steps remain.
    assert.equal(undoCount, 49);
  });

  test("undo/redo preserve the component tree", () => {
    const a = stateStore.addComponent("navbar", undefined, {}, null, "ai");
    stateStore.addComponent("hero", undefined, {}, null, "ai");
    assert.equal(stateStore.getState().components.length, 2);
    stateStore.undo();
    assert.equal(stateStore.getState().components.length, 1);
    stateStore.undo();
    assert.equal(stateStore.getState().components.length, 0);
    stateStore.redo();
    assert.equal(stateStore.getState().components.length, 1);
    stateStore.redo();
    assert.equal(stateStore.getState().components.length, 2);
    assert.ok(stateStore.getState().components.some((c) => c.id === a.id));
  });
});

describe("pages", () => {
  test("initial state has a single Home page", () => {
    const state = stateStore.getState();
    assert.equal(state.pages.length, 1);
    assert.equal(state.pages[0].name, "Home");
    assert.equal(state.currentPageId, state.pages[0].id);
  });

  test("addPage creates a page and makes it current", () => {
    const page = stateStore.addPage("About", "ai");
    const state = stateStore.getState();
    assert.equal(state.pages.length, 2);
    assert.equal(state.currentPageId, page.id);
  });

  test("switchPage switches current page and returns false for unknown ids", () => {
    const pageA = stateStore.getState().currentPageId!;
    const pageB = stateStore.addPage("B", "ai");
    assert.equal(stateStore.switchPage(pageA, "ai"), true);
    assert.equal(stateStore.getState().currentPageId, pageA);
    assert.equal(stateStore.switchPage("nope", "ai"), false);
    assert.equal(stateStore.switchPage(pageB.id, "ai"), true);
  });

  test("removePage falls back to first page and cannot remove the last page", () => {
    stateStore.addPage("B", "ai");
    const state = stateStore.getState();
    const pageB = state.pages.find((p) => p.name === "B")!;
    assert.equal(stateStore.removePage(pageB.id, "ai"), true);
    assert.equal(stateStore.getState().pages.length, 1);
    const only = stateStore.getState().pages[0];
    assert.equal(stateStore.removePage(only.id, "ai"), false);
    assert.equal(stateStore.removePage("missing", "ai"), false);
  });

  test("renamePage renames and rejects unknown ids", () => {
    const page = stateStore.getState().pages[0];
    assert.equal(stateStore.renamePage(page.id, "Renamed", "ai"), true);
    assert.equal(stateStore.getState().pages[0].name, "Renamed");
    assert.equal(stateStore.renamePage("missing", "x", "ai"), false);
  });

  test("components are isolated per page", () => {
    stateStore.addComponent("hero", undefined, {}, null, "ai");
    const pageB = stateStore.addPage("B", "ai");
    assert.equal(stateStore.getState().components.length, 0);
    stateStore.switchPage(stateStore.getState().pages[0].id, "ai");
    assert.equal(stateStore.getState().components.length, 1);
    stateStore.switchPage(pageB.id, "ai");
    assert.equal(stateStore.getState().components.length, 0);
  });
});

describe("components", () => {
  test("addComponent pushes to the current page", () => {
    const node = stateStore.addComponent("hero", "center", { title: "Hi" }, null, "ai");
    assert.equal(node.type, "hero");
    assert.ok(node.id.startsWith("comp_"));
    assert.equal(stateStore.getState().components.length, 1);
    assert.equal(stateStore.getState().components[0].id, node.id);
  });

  test("addComponent with parentId nests under the parent", () => {
    const parent = stateStore.addComponent("card", undefined, {}, null, "ai");
    const child = stateStore.addComponent("button", undefined, {}, parent.id, "ai");
    const state = stateStore.getState();
    assert.equal(state.components.length, 1);
    assert.equal(state.components[0].children.length, 1);
    assert.equal(state.components[0].children[0].id, child.id);
  });

test("updateComponent merges props and rejects unknown ids", () => {
    const node = stateStore.addComponent("card", undefined, { title: "A" }, null, "ai");
    assert.equal(stateStore.updateComponent(node.id, { description: "D" }, "ai"), true);
    const updated = stateStore.getState().components[0];
    assert.equal(updated.props.title, "A");
    assert.equal(updated.props.description, "D");
    assert.equal(stateStore.updateComponent("missing", {}, "ai"), false);
  });

  test("removeComponent removes nested children", () => {
    const parent = stateStore.addComponent("card", undefined, {}, null, "ai");
    const child = stateStore.addComponent("button", undefined, {}, parent.id, "ai");
    assert.equal(stateStore.removeComponent(child.id, "ai"), true);
    assert.equal(stateStore.getState().components[0].children.length, 0);
    assert.equal(stateStore.removeComponent("missing", "ai"), false);
  });

  test("reorderComponent moves before/after and rejects invalid targets", () => {
    const a = stateStore.addComponent("navbar", undefined, {}, null, "ai");
    const b = stateStore.addComponent("hero", undefined, {}, null, "ai");
    const c = stateStore.addComponent("footer", undefined, {}, null, "ai");
    assert.equal(stateStore.reorderComponent(a.id, c.id, "after", "ai"), true);
    assert.deepEqual(
      stateStore.getState().components.map((n) => n.id),
      [b.id, c.id, a.id]
    );
    assert.equal(stateStore.reorderComponent(a.id, a.id, "before", "ai"), false);
    assert.equal(stateStore.reorderComponent("missing", c.id, "before", "ai"), false);
  });

  test("setAnimation merges animation fields and rejects unknown ids", () => {
    const node = stateStore.addComponent("card", undefined, {}, null, "ai");
    assert.equal(stateStore.setAnimation(node.id, { entry: "fadeUp", duration: 0.4 }, "ai"), true);
    assert.equal(stateStore.setAnimation(node.id, { hover: "scaleUp" }, "ai"), true);
    const animation = stateStore.getState().components[0].animation!;
    assert.equal(animation.entry, "fadeUp");
    assert.equal(animation.hover, "scaleUp");
    assert.equal(animation.duration, 0.4);
    assert.equal(stateStore.setAnimation("missing", { entry: "fadeIn" }, "ai"), false);
  });

  test("dependency advisory is logged for footer without navbar", () => {
    stateStore.addComponent("footer", undefined, {}, null, "ai");
    assert.ok(
      stateStore.getState().activityLog.some((e) => e.action === "component_warning")
    );
  });
});

test("updateComponent accepts layout and visibility/locked flags", () => {
  const comp = stateStore.addComponent("card", undefined, { title: "x" }, null, "ai");
  const ok = stateStore.updateComponent(
    comp.id,
    {},
    "user",
    { x: 10, y: 20, w: 300, h: 160 },
    { visible: false, locked: true }
  );
  assert.equal(ok, true);
  const node = stateStore.getState().components[0];
  assert.deepEqual(node.layout, { x: 10, y: 20, w: 300, h: 160 });
  assert.equal(node.visible, false);
  assert.equal(node.locked, true);
});

describe("tokens and conflicts", () => {
  test("setToken stores value with source", () => {
    stateStore.setToken("colors", "color-primary", "#FF5733", "user");
    const token = stateStore.getState().tokens.colors["color-primary"];
    assert.equal(token.value, "#FF5733");
    assert.equal(token.source, "user");
  });

  test("setTokenBatch stores multiple tokens and logs one activity entry", () => {
    stateStore.setTokenBatch("spacing", { "space-sm": "0.5rem", "space-md": "1rem" }, "ai");
    const tokens = stateStore.getState().tokens.spacing;
    assert.equal(tokens["space-sm"].value, "0.5rem");
    assert.equal(tokens["space-md"].value, "1rem");
    assert.ok(
      stateStore.getState().activityLog.some((e) => e.action === "set_token_batch")
    );
  });

  test("getTokenConflicts is empty when no tokens are set", () => {
    assert.deepEqual(stateStore.getTokenConflicts(), []);
  });

  test("low-contrast text/background reports a conflict", () => {
    stateStore.setToken("colors", "color-text", "#FFFFFF", "ai");
    stateStore.setToken("colors", "color-bg", "#FFFFFF", "ai");
    const conflicts = stateStore.getTokenConflicts();
    assert.ok(conflicts.some((c) => c.key === "color-text"));
  });

  test("low-contrast primary button reports a conflict", () => {
    stateStore.setToken("colors", "color-primary", "#FFFFFF", "ai");
    stateStore.setToken("colors", "color-text", "#FFFFFF", "ai");
    const conflicts = stateStore.getTokenConflicts();
    assert.ok(conflicts.some((c) => c.key === "color-primary"));
  });

  test("invalid color values do not throw", () => {
    stateStore.setToken("colors", "color-text", "not-a-color", "ai");
    stateStore.setToken("colors", "color-bg", "not-a-color", "ai");
    assert.ok(Array.isArray(stateStore.getTokenConflicts()));
  });

  test("token conflict is recorded in the activity log", () => {
    stateStore.setToken("colors", "color-text", "#FFFFFF", "ai");
    stateStore.setToken("colors", "color-bg", "#FFFFFF", "ai");
    assert.ok(
      stateStore.getState().activityLog.some((e) => e.action === "token_conflict")
    );
  });
});

describe("getState", () => {
  test("returns a deep copy that cannot mutate the store", () => {
    const copy = stateStore.getState();
    copy.projectName = "Hacked";
    copy.tokens.colors["color-primary"] = { value: "#000000", source: "user" };
    const state = stateStore.getState();
    assert.equal(state.projectName, "Untitled Project");
    assert.equal(state.tokens.colors["color-primary"], undefined);
  });

test("exposes canUndo/canRedo booleans", () => {
    let state = stateStore.getState();
    assert.equal(state.canUndo, false);
    assert.equal(state.canRedo, false);
    stateStore.setProjectName("A", "ai");
    state = stateStore.getState();
    assert.equal(state.canUndo, true);
    assert.equal(state.canRedo, false);
    stateStore.undo();
    state = stateStore.getState();
    assert.equal(state.canUndo, false);
    assert.equal(state.canRedo, true);
  });

  test("activity log is capped at 100 entries", () => {
    for (let i = 0; i < 110; i++) {
      stateStore.setToken("colors", `key-${i}`, "#FF5733", "ai");
    }
    assert.equal(stateStore.getState().activityLog.length, 100);
  });
});

test("revision increments on mutation and resets on restore", () => {
  assert.equal(stateStore.getState().revision, 0);
  stateStore.addComponent("card", undefined, { title: "x" }, null, "ai");
  assert.equal(stateStore.getState().revision, 1);
  stateStore.setToken("colors", "color-primary", "#123456", "user");
  assert.equal(stateStore.getState().revision, 2);
  stateStore.restoreSnapshot(stateStore.getState());
  assert.equal(stateStore.getState().revision, 2, "restore keeps snapshot revision");
  stateStore.resetForTests();
  assert.equal(stateStore.getState().revision, 0);
});

describe("events, clearAll, and pending prompt", () => {
  test("emits a change event on mutation", () => {
    const seen: unknown[] = [];
    const listener = (change: unknown) => seen.push(change);
    stateStore.on("change", listener);
    try {
      stateStore.setProjectName("A", "ai");
      assert.equal(seen.length, 1);
      assert.deepEqual((seen[0] as { type: string }).type, "projectName");
    } finally {
      stateStore.off("change", listener);
    }
  });

  test("clearAll resets tokens, pages, and theme", () => {
    stateStore.setToken("colors", "color-primary", "#FF5733", "ai");
    stateStore.setThemeMode("dark", "ai");
    stateStore.addPage("B", "ai");
    stateStore.clearAll("ai");
    const state = stateStore.getState();
    assert.equal(Object.keys(state.tokens.colors).length, 0);
    assert.equal(state.pages.length, 1);
    assert.equal(state.themeMode, "light");
  });

  test("pending prompt can be set, read, and cleared", () => {
    assert.equal(stateStore.getPendingPrompt(), null);
    stateStore.setPendingPrompt("Make it warmer");
    assert.equal(stateStore.getPendingPrompt(), "Make it warmer");
    stateStore.clearPendingPrompt();
    assert.equal(stateStore.getPendingPrompt(), null);
  });
});
