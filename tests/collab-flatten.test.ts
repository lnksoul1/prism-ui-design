// tests/collab-flatten.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { ComponentNode, PageDef } from "../src/state.js";
import { flattenPages, buildPageTrees } from "../src/collab/flatten.js";

const n = (id: string, children: ComponentNode[] = []): ComponentNode =>
  ({ id, type: "text", props: { text: id }, children }) as ComponentNode;

const pages: PageDef[] = [
  { id: "p1", name: "A", components: [n("a", [n("a1")]), n("b")] },
  { id: "p2", name: "B", components: [n("z")] },
];

describe("flattenPages", () => {
  test("flattens trees into id-keyed entries with parent/page/index", () => {
    const entries = flattenPages(pages);
    const a = entries.get("a")!;
    assert.equal(a.node.id, "a");
    assert.equal(a.node.type, "text");
    assert.equal(a.parentId, null);
    assert.equal(a.pageId, "p1");
    assert.equal(a.index, 0);
    assert.equal(entries.get("a1")!.parentId, "a");
    assert.equal(entries.get("a1")!.index, 0);
    assert.equal(entries.get("b")!.parentId, null);
    assert.equal(entries.get("b")!.index, 1);
    assert.equal(entries.get("z")!.pageId, "p2");
    // 所有节点的 children 恒为空（子组件由索引独立表示）
    for (const e of entries.values()) assert.deepEqual(e.node.children, []);
  });
});

describe("buildPageTrees", () => {
  test("round-trips trees with nesting and order", () => {
    const trees = buildPageTrees(flattenPages(pages));
    assert.deepEqual(trees.get("p1")!.map((c) => c.id), ["a", "b"]);
    assert.deepEqual(trees.get("p1")![0].children.map((c) => c.id), ["a1"]);
    assert.deepEqual(trees.get("p2")!.map((c) => c.id), ["z"]);
    assert.equal(trees.get("p1")![0].props.text, "a");
  });

  test("empty pages produce empty arrays", () => {
    const trees = buildPageTrees(new Map());
    assert.equal(trees.size, 0);
  });
});
