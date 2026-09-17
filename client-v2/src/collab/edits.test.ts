// client-v2/src/collab/edits.test.ts
import { test, expect } from "vitest";
import { initLocalCollabForTests } from "./collab";
import { editComponent, reorderComponents, undo, redo } from "./edits";

function seed(): ReturnType<typeof initLocalCollabForTests> {
  const inst = initLocalCollabForTests();
  inst.ydoc.getMap("components").set("c1", {
    id: "c1", type: "text", props: {}, children: [], baseStyle: {}, breakpointOverrides: {},
  });
  inst.ydoc.getMap("index").set("c1", { parentId: null, pageId: "p1", index: 0 });
  return inst;
}

/** 图层拖拽用种子: p1 根层级 c1/c2/c3（底→顶），另含他页 o1 与子组件 k1。 */
function seedPage(): ReturnType<typeof initLocalCollabForTests> {
  const inst = initLocalCollabForTests();
  const add = (id: string, i: number, parentId: string | null, pageId: string): void => {
    inst.ydoc.getMap("components").set(id, { id, type: "text", props: {}, children: [] });
    inst.ydoc.getMap("index").set(id, { parentId, pageId, index: i });
  };
  add("c1", 0, null, "p1");
  add("c2", 1, null, "p1");
  add("c3", 2, null, "p1");
  add("k1", 0, "c1", "p1"); // 子组件：不属于根层级
  add("o1", 0, null, "p2"); // 他页组件：不受影响
  return inst;
}

test("editComponent mutates the ydoc entry and is undoable", () => {
  const inst = seed();
  editComponent("c1", (d) => {
    d.baseStyle = { color: "#f00" };
  });
  expect((inst.ydoc.getMap("components").get("c1") as { baseStyle: unknown }).baseStyle).toEqual({ color: "#f00" });

  expect(undo()).toBe(true);
  expect((inst.ydoc.getMap("components").get("c1") as { baseStyle: unknown }).baseStyle).toEqual({});

  expect(redo()).toBe(true);
  expect((inst.ydoc.getMap("components").get("c1") as { baseStyle: unknown }).baseStyle).toEqual({ color: "#f00" });
});

test("undo with empty stack returns false", () => {
  seed();
  expect(undo()).toBe(false);
});

test("editComponent throws for unknown id", () => {
  seed();
  expect(() => editComponent("nope", () => undefined)).toThrow(/协同文档/);
});

test("reorderComponents rewrites the page's root index entries 0..n-1 in one undo step", () => {
  const inst = seedPage();
  reorderComponents("p1", ["c3", "c1", "c2"]); // 新的底→顶顺序
  const index = inst.ydoc.getMap("index");
  expect(index.get("c3")).toEqual({ parentId: null, pageId: "p1", index: 0 });
  expect(index.get("c1")).toEqual({ parentId: null, pageId: "p1", index: 1 });
  expect(index.get("c2")).toEqual({ parentId: null, pageId: "p1", index: 2 });
  // 只动该页根层级：子组件与他页条目原样
  expect(index.get("k1")).toEqual({ parentId: "c1", pageId: "p1", index: 0 });
  expect(index.get("o1")).toEqual({ parentId: null, pageId: "p2", index: 0 });

  // 单事务 = 单 undo 步
  expect(inst.undoManager.undoStack.length).toBe(1);
  undo();
  expect((index.get("c1") as { index: number }).index).toBe(0);
  expect((index.get("c2") as { index: number }).index).toBe(1);
  expect((index.get("c3") as { index: number }).index).toBe(2);
});

test("reorderComponents ignores non-root / foreign-page ids and unchanged order", () => {
  const inst = seedPage();
  // k1（子组件）与 o1（他页）不在 p1 根层级，被过滤；c2 顺序不变
  reorderComponents("p1", ["c1", "k1", "o1", "c2", "c3"]);
  const index = inst.ydoc.getMap("index");
  expect((index.get("c1") as { index: number }).index).toBe(0);
  expect((index.get("k1") as { index: number }).index).toBe(0); // 未被改写
  expect((index.get("o1") as { index: number }).index).toBe(0); // 未被改写
  // 顺序与现状一致 → 无 ydoc 操作 → 无 undo 步
  expect(inst.undoManager.undoStack.length).toBe(0);
});
