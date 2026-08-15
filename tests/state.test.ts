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

test("duplicateComponent deep-copies and inserts after the original", () => {
  const original = stateStore.addComponent("card", "elevated", { title: "A", items: [{ label: "x" }] }, null, "ai");
  original.layout = { x: 0, y: 0, w: 300, h: 160 };
  const copy = stateStore.duplicateComponent(original.id, "user");
  assert.ok(copy, "duplicate should return the new node");
  assert.notEqual(copy!.id, original.id);

  const components = stateStore.getState().components;
  assert.equal(components.length, 2);
  assert.equal(components[1].id, copy!.id, "clone inserted immediately after the original");
  assert.deepEqual(copy!.props, original.props, "props are deep-copied");
  assert.equal(copy!.variant, "elevated");
  assert.notDeepEqual(copy!.layout, original.layout, "clone is nudged so it is distinct");

  // The clone is independent: mutating it must not touch the original.
  copy!.props.title = "B";
  assert.equal(original.props.title, "A");
});

test("duplicateComponent returns null for unknown ids", () => {
  assert.equal(stateStore.duplicateComponent("nope", "user"), null);
});

test("replaceComponent swaps the definition in place, keeping id and layout", () => {
  const comp = stateStore.addComponent("button", undefined, { text: "Go" }, null, "ai");
  stateStore.updateComponent(comp.id, {}, "user", { x: 12, y: 34, w: 200, h: 48 });
  stateStore.setBehavior(comp.id, { type: "toast", message: "old" }, "user");

  const ok = stateStore.replaceComponent(
    comp.id,
    { type: "pricing", variant: "3col", props: { plans: [{ name: "A" }] }, behavior: null },
    "user"
  );
  assert.equal(ok, true);

  const node = stateStore.getState().components.find((c) => c.id === comp.id);
  assert.ok(node);
  assert.equal(node.id, comp.id, "id preserved");
  assert.equal(node.type, "pricing");
  assert.equal(node.variant, "3col");
  assert.deepEqual(node.props, { plans: [{ name: "A" }] });
  assert.deepEqual(node.layout, { x: 12, y: 34, w: 200, h: 48 }, "layout preserved");
  assert.equal(node.behavior, undefined, "behavior cleared when null");
});

test("replaceComponent drops children, binds new behavior, and is undoable", () => {
  const parent = stateStore.addComponent("card", undefined, {}, null, "ai");
  stateStore.addComponent("button", undefined, { text: "child" }, parent.id, "ai");

  stateStore.replaceComponent(
    parent.id,
    {
      type: "form",
      props: { fields: [{ label: "x" }] },
      behavior: { type: "submit", form_id: "f1" },
    },
    "user"
  );
  const replaced = stateStore.getState().components.find((c) => c.id === parent.id);
  assert.equal(replaced?.type, "form");
  assert.equal(replaced?.children.length, 0, "children dropped");
  assert.deepEqual(replaced?.behavior, { type: "submit", form_id: "f1" });

  assert.equal(stateStore.undo(), true);
  const restored = stateStore.getState().components.find((c) => c.id === parent.id);
  assert.equal(restored?.type, "card");
  assert.equal(restored?.children.length, 1);
});

test("replaceComponent returns false for unknown ids", () => {
  assert.equal(
    stateStore.replaceComponent("comp_nope", { type: "hero", props: {} }, "user"),
    false
  );
});

test("renameComponent sets a custom layer name, clears with empty, undoable", () => {
  const comp = stateStore.addComponent("button", undefined, { text: "Go" }, null, "ai");
  assert.equal(stateStore.renameComponent(comp.id, "主要按钮", "user"), true);
  assert.equal(stateStore.getState().components[0].name, "主要按钮");

  // Empty string reverts to the type-based default
  assert.equal(stateStore.renameComponent(comp.id, "   ", "user"), true);
  assert.equal(stateStore.getState().components[0].name, undefined);

  // Undo restores the custom name
  stateStore.renameComponent(comp.id, "CTA 按钮", "user");
  assert.equal(stateStore.undo(), true);
  assert.equal(stateStore.getState().components[0].name, undefined);

  assert.equal(stateStore.renameComponent("comp_nope", "x", "user"), false);
});

test("setBehavior binds and clears an interaction, unknown ids fail", () => {
  const comp = stateStore.addComponent("button", undefined, { text: "Go" }, null, "ai");
  const ok = stateStore.setBehavior(comp.id, { type: "navigate", page_id: "page_2" }, "user");
  assert.equal(ok, true);
  const node = stateStore.getState().components[0];
  assert.deepEqual(node.behavior, { type: "navigate", page_id: "page_2" });

  // null removes the behavior
  assert.equal(stateStore.setBehavior(comp.id, null, "user"), true);
  assert.equal(stateStore.getState().components[0].behavior, undefined);

  // invalid behavior type falls back to clearing
  stateStore.setBehavior(comp.id, { type: "teleport", page_id: "x" } as never, "user");
  assert.equal(stateStore.getState().components[0].behavior, undefined);

  assert.equal(stateStore.setBehavior("comp_nope", { type: "toast", message: "hi" }, "user"), false);
});

test("setElementMeta binds element-level behavior and kind, clears them, unknown ids fail", () => {
  const comp = stateStore.addComponent("hero", undefined, { title: "Hi", button_text: "Go" }, null, "ai");
  // Bind element-level behavior + type promotion on "title"
  assert.equal(
    stateStore.setElementMeta(comp.id, "title", { behavior: { type: "toast", message: "你好" }, kind: "button" }, "user"),
    true
  );
  const node = stateStore.getState().components[0];
  assert.deepEqual(node.elementMeta, {
    title: { behavior: { type: "toast", message: "你好" }, kind: "button" },
  });

  // Update kind only keeps the behavior
  assert.equal(stateStore.setElementMeta(comp.id, "title", { kind: "link" }, "user"), true);
  assert.deepEqual(stateStore.getState().components[0].elementMeta, {
    title: { behavior: { type: "toast", message: "你好" }, kind: "link" },
  });

  // Clearing with null removes the whole entry (and the map when empty)
  assert.equal(stateStore.setElementMeta(comp.id, "title", null, "user"), true);
  assert.equal(stateStore.getState().components[0].elementMeta, undefined);

  // Invalid kind / behavior types are rejected (treated as cleared fields)
  stateStore.setElementMeta(comp.id, "button_text", { kind: "banner" as never, behavior: { type: "teleport" as never } }, "user");
  assert.equal(stateStore.getState().components[0].elementMeta, undefined);

  // Empty path / unknown component fail
  assert.equal(stateStore.setElementMeta(comp.id, "", { kind: "button" }, "user"), false);
  assert.equal(stateStore.setElementMeta("comp_nope", "title", { kind: "button" }, "user"), false);

  // Undo restores the metadata
  stateStore.setElementMeta(comp.id, "title", { kind: "button" }, "user");
  assert.equal(stateStore.undo(), true);
  assert.equal(stateStore.getState().components[0].elementMeta, undefined);
});

test("setPageBackground sets, clears, and undoes the page background", () => {
  // Set a gradient background
  assert.equal(
    stateStore.setPageBackground(
      { type: "gradient", value: "linear-gradient(135deg, #6366f1, #22d3ee)" },
      "user"
    ),
    true
  );
  assert.deepEqual(stateStore.getState().pageBackground, {
    type: "gradient",
    value: "linear-gradient(135deg, #6366f1, #22d3ee)",
  });

  // Animated preset carries animation name + params
  stateStore.setPageBackground(
    { type: "animation", value: "linear-gradient(135deg, #6366f1, #ec4899) 0 0 / 300% 300%", animation: "aurora", params: { speed: 18 } },
    "user"
  );
  assert.equal(stateStore.getState().pageBackground?.type, "animation");
  assert.equal(stateStore.getState().pageBackground?.animation, "aurora");
  assert.deepEqual(stateStore.getState().pageBackground?.params, { speed: 18 });

  // Clearing with null removes it
  assert.equal(stateStore.setPageBackground(null, "user"), true);
  assert.equal(stateStore.getState().pageBackground, undefined);

  // Undo restores the background
  stateStore.setPageBackground({ type: "color", value: "#0f172a" }, "user");
  assert.equal(stateStore.undo(), true);
  assert.equal(stateStore.getState().pageBackground, undefined);
});

test("alignComponents aligns and distributes freeform layouts", () => {
  const a = stateStore.addComponent("button", undefined, {}, null, "ai");
  const b = stateStore.addComponent("card", undefined, {}, null, "ai");
  const c = stateStore.addComponent("image", undefined, {}, null, "ai");
  const set = (id: string, x: number, y: number, w: number, h: number) =>
    stateStore.updateComponent(id, {}, "user", { x, y, w, h });
  set(a.id, 10, 10, 100, 40);
  set(b.id, 200, 60, 120, 60);
  set(c.id, 400, 20, 80, 30);

  // Align left: all x = min x
  assert.equal(stateStore.alignComponents([a.id, b.id, c.id], "left", "user"), true);
  const after = stateStore.getState().components;
  assert.equal(after[0].layout!.x, 10);
  assert.equal(after[1].layout!.x, 10);
  assert.equal(after[2].layout!.x, 10);

  // Align center_x keeps original x positions distinct after right-alignment check
  set(a.id, 10, 10, 100, 40);
  set(b.id, 200, 60, 120, 60);
  set(c.id, 400, 20, 80, 30);
  stateStore.alignComponents([a.id, b.id, c.id], "center_x", "user");
  const centered = stateStore.getState().components;
  const cx = (b0: { layout?: { x: number; w: number } }) => b0.layout!.x + b0.layout!.w / 2;
  assert.ok(Math.abs(cx(centered[0]) - cx(centered[1])) < 0.001);
  assert.ok(Math.abs(cx(centered[1]) - cx(centered[2])) < 0.001);

  // Distribute_y: equal spaces between element edges
  set(a.id, 0, 0, 100, 40);
  set(b.id, 0, 100, 120, 60);
  set(c.id, 0, 300, 80, 30);
  stateStore.alignComponents([a.id, b.id, c.id], "distribute_y", "user");
  const dist = stateStore.getState().components;
  const byId = new Map(dist.map((n) => [n.id, n.layout!]));
  const gap1 = byId.get(b.id)!.y - (byId.get(a.id)!.y + byId.get(a.id)!.h);
  const gap2 = byId.get(c.id)!.y - (byId.get(b.id)!.y + byId.get(b.id)!.h);
  assert.ok(Math.abs(gap1 - gap2) < 0.001, `equal spaces between elements (${gap1} vs ${gap2})`);
  assert.ok(gap1 > 0, "spaces are non-negative");

  // Fewer than 2 valid targets fails
  assert.equal(stateStore.alignComponents([a.id], "left", "user"), false);
  assert.equal(stateStore.alignComponents([a.id, "comp_nope"], "left", "user"), false);
});

test("zOrderComponent reorders stacking within the page list", () => {
  const a = stateStore.addComponent("button", undefined, {}, null, "ai");
  const b = stateStore.addComponent("card", undefined, {}, null, "ai");
  const c = stateStore.addComponent("image", undefined, {}, null, "ai");
  const ids = () => stateStore.getState().components.map((n) => n.id);

  assert.equal(stateStore.zOrderComponent(a.id, "front", "user"), true);
  assert.deepEqual(ids(), [b.id, c.id, a.id]);

  assert.equal(stateStore.zOrderComponent(a.id, "back", "user"), true);
  assert.deepEqual(ids(), [a.id, b.id, c.id]);

  assert.equal(stateStore.zOrderComponent(c.id, "backward", "user"), true);
  assert.deepEqual(ids(), [a.id, c.id, b.id]);

  assert.equal(stateStore.zOrderComponent(a.id, "forward", "user"), true);
  assert.deepEqual(ids(), [c.id, a.id, b.id]);

  assert.equal(stateStore.zOrderComponent("comp_nope", "front", "user"), false);
});

test("setImport records product provenance and clearAll resets it", () => {
  const page = stateStore.addPage("我的产品", "user");
  stateStore.setImport(page.id, {
    kind: "html",
    source: "Pasted HTML",
    html_file: "/tmp/x.html",
    imported_at: new Date().toISOString(),
    component_count: 3,
  }, "user");
  const record = stateStore.getImport(page.id);
  assert.ok(record);
  assert.equal(record!.source, "Pasted HTML");
  assert.equal(record!.component_count, 3);
  assert.equal(stateStore.getImport("page_nope"), null);

  stateStore.clearAll("user");
  assert.equal(stateStore.getImport(page.id), null, "clearAll wipes import records");
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

  test("page links: add, dedupe by source component, and remove", () => {
    const p1 = stateStore.getState().currentPageId as string;
    const p2 = stateStore.addPage("About", "user").id;
    const link = stateStore.addPageLink(p1, p2, "Go to About", "comp_x", "user");
    assert.ok(link.id.startsWith("link_"));
    assert.equal(stateStore.getState().pageLinks.length, 1);

    // Same source component replaces the old link instead of duplicating
    stateStore.addPageLink(p1, p2, "Updated", "comp_x", "user");
    assert.equal(stateStore.getState().pageLinks.length, 1);
    assert.equal(stateStore.getState().pageLinks[0].label, "Updated");

    // Unknown pages are rejected
    assert.throws(
      () => stateStore.addPageLink(p1, "page_nope", undefined, undefined, "user"),
      /page must exist/
    );

    // Removal works against the current link id
    const current = stateStore.getState().pageLinks[0];
    assert.equal(stateStore.removePageLink(current.id, "user"), true);
    assert.equal(stateStore.getState().pageLinks.length, 0);
    assert.equal(stateStore.removePageLink(current.id, "user"), false);
  });
});
