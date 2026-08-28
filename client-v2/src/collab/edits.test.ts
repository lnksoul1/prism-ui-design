// client-v2/src/collab/edits.test.ts
import { test, expect } from "vitest";
import { initLocalCollabForTests } from "./collab";
import { editComponent, undo, redo } from "./edits";

function seed(): ReturnType<typeof initLocalCollabForTests> {
  const inst = initLocalCollabForTests();
  inst.ydoc.getMap("components").set("c1", {
    id: "c1", type: "text", props: {}, children: [], baseStyle: {}, breakpointOverrides: {},
  });
  inst.ydoc.getMap("index").set("c1", { parentId: null, pageId: "p1", index: 0 });
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
