// client-v2/src/lib/shortcuts.test.tsx — 键盘快捷键: 微移/删除/复制/撤销重做/Escape
import { test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { initLocalCollabForTests } from "../collab/collab";
import { editComponent, undo } from "../collab/edits";
import { useDesignStore } from "../stores/design";
import { handleShortcut, useCanvasShortcuts, type ShortcutContext } from "./shortcuts";

vi.mock("../api", () => ({
  api: {
    deleteComponent: vi.fn().mockResolvedValue({ success: true }),
    duplicateComponent: vi.fn().mockImplementation(async (id: string) => ({ success: true, id: `${id}-copy`, type: "text" })),
  },
}));

import { api } from "../api";

/** 种子: p1 根层级 c1(100,50) / c2(0,0)，带布局可微移。 */
function seed(): ReturnType<typeof initLocalCollabForTests> {
  const inst = initLocalCollabForTests();
  const add = (id: string, x: number, y: number): void => {
    inst.ydoc.getMap("components").set(id, {
      id, type: "text", props: {}, children: [], layout: { x, y, w: 320, h: 80 },
    });
    inst.ydoc.getMap("index").set(id, { parentId: null, pageId: "p1", index: 0 });
  };
  add("c1", 100, 50);
  add("c2", 0, 0);
  return inst;
}

const layoutOf = (inst: ReturnType<typeof initLocalCollabForTests>, id: string): Record<string, number> =>
  (inst.ydoc.getMap("components").get(id) as { layout: Record<string, number> }).layout;

function makeCtx(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
  return {
    selection: [],
    playMode: false,
    linkMode: false,
    setSelection: vi.fn(),
    exitLinkMode: vi.fn(),
    ...overrides,
  };
}

/** 在 target 上派发 keydown（冒泡到 document），经 handleShortcut 处理，返回是否消费。 */
function press(ctx: ShortcutContext, target: EventTarget, init: { key: string; ctrlKey?: boolean; shiftKey?: boolean }): boolean {
  let handled = false;
  const onKey = (e: Event): void => {
    handled = handleShortcut(e as KeyboardEvent, ctx);
  };
  document.addEventListener("keydown", onKey);
  try {
    fireEvent.keyDown(target as Node, init);
  } finally {
    document.removeEventListener("keydown", onKey);
  }
  return handled;
}

beforeEach(() => {
  vi.clearAllMocks();
  useDesignStore.setState({ selection: [], playMode: false, linkMode: false });
});

test("arrow keys nudge every selected component (1px, Shift 8px), one undo step per keypress", () => {
  const inst = seed();
  const ctx = makeCtx({ selection: ["c1", "c2"] });

  expect(press(ctx, document.body, { key: "ArrowRight" })).toBe(true);
  expect(layoutOf(inst, "c1")).toEqual({ x: 101, y: 50, w: 320, h: 80 });
  expect(layoutOf(inst, "c2")).toEqual({ x: 1, y: 0, w: 320, h: 80 });
  expect(inst.undoManager.undoStack.length).toBe(1);

  expect(press(ctx, document.body, { key: "ArrowDown", shiftKey: true })).toBe(true);
  expect(layoutOf(inst, "c1")).toEqual({ x: 101, y: 58, w: 320, h: 80 });

  expect(press(ctx, document.body, { key: "ArrowLeft" })).toBe(true);
  expect(layoutOf(inst, "c1").x).toBe(100);
  expect(press(ctx, document.body, { key: "ArrowUp" })).toBe(true);
  expect(layoutOf(inst, "c1").y).toBe(57); // 58 - 1

  // 撤销到底（UndoManager 可能合并快速连击）: 微移全部回滚到种子位置
  let guard = 0;
  while (undo() && guard < 10) guard++;
  expect(layoutOf(inst, "c1")).toEqual({ x: 100, y: 50, w: 320, h: 80 });
  expect(layoutOf(inst, "c2")).toEqual({ x: 0, y: 0, w: 320, h: 80 });
});

test("arrow keys with no selection are not consumed", () => {
  seed();
  expect(press(makeCtx(), document.body, { key: "ArrowRight" })).toBe(false);
});

test("typing in an input/textarea/contentEditable does not trigger shortcuts", () => {
  const inst = seed();
  const input = document.createElement("input");
  const textarea = document.createElement("textarea");
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  // jsdom 不计算 isContentEditable：手工桩为 true 模拟可编辑宿主
  Object.defineProperty(editable, "isContentEditable", { value: true });
  document.body.append(input, textarea, editable);
  const ctx = makeCtx({ selection: ["c1"] });

  press(ctx, input, { key: "ArrowRight" });
  press(ctx, textarea, { key: "Delete" });
  press(ctx, editable, { key: "d", ctrlKey: true });

  expect(layoutOf(inst, "c1").x).toBe(100);
  expect(api.deleteComponent).not.toHaveBeenCalled();
  expect(api.duplicateComponent).not.toHaveBeenCalled();
  input.remove();
  textarea.remove();
  editable.remove();
});

test("Delete / Backspace remove every selected component via api and clear the selection", () => {
  seed();
  const ctx = makeCtx({ selection: ["c1", "c2"] });

  expect(press(ctx, document.body, { key: "Delete" })).toBe(true);
  expect(api.deleteComponent).toHaveBeenCalledWith("c1");
  expect(api.deleteComponent).toHaveBeenCalledWith("c2");
  expect(ctx.setSelection).toHaveBeenCalledWith([]);

  expect(press(makeCtx({ selection: ["c2"] }), document.body, { key: "Backspace" })).toBe(true);
  expect(api.deleteComponent).toHaveBeenCalledWith("c2");
});

test("Delete with no selection is not consumed", () => {
  seed();
  expect(press(makeCtx(), document.body, { key: "Delete" })).toBe(false);
  expect(api.deleteComponent).not.toHaveBeenCalled();
});

test("Ctrl+D duplicates each selected component and selects the new ids", async () => {
  seed();
  const ctx = makeCtx({ selection: ["c1", "c2"] });

  expect(press(ctx, document.body, { key: "d", ctrlKey: true })).toBe(true);
  expect(api.duplicateComponent).toHaveBeenCalledWith("c1");
  expect(api.duplicateComponent).toHaveBeenCalledWith("c2");
  await waitFor(() => expect(ctx.setSelection).toHaveBeenCalledWith(["c1-copy", "c2-copy"]));
});

test("Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y reuse the toolbar undo/redo handlers", () => {
  const inst = seed();
  editComponent("c1", (d) => {
    (d.layout as Record<string, number>).x = 999;
  });
  const ctx = makeCtx({ selection: ["c1"] });

  press(ctx, document.body, { key: "z", ctrlKey: true });
  expect(layoutOf(inst, "c1").x).toBe(100); // 撤销

  press(ctx, document.body, { key: "Z", ctrlKey: true, shiftKey: true });
  expect(layoutOf(inst, "c1").x).toBe(999); // 重做

  press(ctx, document.body, { key: "z", ctrlKey: true });
  expect(layoutOf(inst, "c1").x).toBe(100);

  press(ctx, document.body, { key: "y", ctrlKey: true });
  expect(layoutOf(inst, "c1").x).toBe(999); // Ctrl+Y 重做
});

test("Escape clears the selection and exits link mode", () => {
  const ctx = makeCtx({ selection: ["c1"], linkMode: true });
  expect(press(ctx, document.body, { key: "Escape" })).toBe(true);
  expect(ctx.setSelection).toHaveBeenCalledWith([]);
  expect(ctx.exitLinkMode).toHaveBeenCalled();
});

test("playMode blocks editing shortcuts but not Escape", () => {
  const inst = seed();
  editComponent("c1", (d) => {
    (d.layout as Record<string, number>).x = 999;
  });
  const ctx = makeCtx({ selection: ["c1"], playMode: true });

  expect(press(ctx, document.body, { key: "ArrowRight" })).toBe(false);
  expect(press(ctx, document.body, { key: "Delete" })).toBe(false);
  expect(press(ctx, document.body, { key: "d", ctrlKey: true })).toBe(false);
  expect(press(ctx, document.body, { key: "z", ctrlKey: true })).toBe(false);
  expect(layoutOf(inst, "c1").x).toBe(999); // 未被撤销/微移
  expect(api.deleteComponent).not.toHaveBeenCalled();
  expect(api.duplicateComponent).not.toHaveBeenCalled();

  expect(press(ctx, document.body, { key: "Escape" })).toBe(true);
  expect(ctx.setSelection).toHaveBeenCalledWith([]);
});

test("useCanvasShortcuts mounts a document keydown listener and cleans up on unmount", () => {
  const inst = seed();
  useDesignStore.setState({ selection: ["c1"] });

  function Harness() {
    useCanvasShortcuts();
    return null;
  }
  const { unmount } = render(<Harness />);

  fireEvent.keyDown(document, { key: "ArrowRight" });
  expect(layoutOf(inst, "c1").x).toBe(101);

  unmount();
  fireEvent.keyDown(document, { key: "ArrowRight" });
  expect(layoutOf(inst, "c1").x).toBe(101); // 卸载后不再响应
});
