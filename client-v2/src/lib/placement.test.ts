// client-v2/src/lib/placement.test.ts — 新增组件的布局落点
import { test, expect } from "vitest";
import { initLocalCollabForTests, collabMaps } from "../collab/collab";
import { waitForComponent, placeNewComponent } from "./placement";
import { useDesignStore } from "../stores/design";
import type { DesignStateView } from "../types";

function setState(pages: Array<{ id: string; components: unknown[] }>): void {
  useDesignStore.setState({
    state: {
      projectName: "P", style: "s", tokens: {},
      pages: pages.map((p) => ({ id: p.id, name: p.id, components: p.components as never[] })),
      currentPageId: pages[0]?.id ?? null, comments: [], revision: 1,
    } as unknown as DesignStateView,
  });
}

test("waitForComponent resolves immediately when the component already exists in ydoc", async () => {
  initLocalCollabForTests();
  collabMaps()!.components.set("a", { id: "a", type: "text", props: {}, children: [] });
  await expect(waitForComponent("a", 100)).resolves.toBeUndefined();
});

test("placeNewComponent staggers below the lowest root component", async () => {
  initLocalCollabForTests();
  collabMaps()!.components.set("a", {
    id: "a", type: "text", props: {}, children: [], layout: { x: 16, y: 16, w: 320, h: 80 },
  });
  collabMaps()!.index.set("a", { parentId: null, pageId: "page-1", index: 0 });
  collabMaps()!.components.set("new", { id: "new", type: "button", props: {}, children: [] });
  collabMaps()!.index.set("new", { parentId: null, pageId: "page-1", index: 1 });

  setState([{
    id: "page-1",
    components: [
      { id: "a", type: "text", props: {}, children: [], layout: { x: 16, y: 16, w: 320, h: 80 } },
      { id: "new", type: "button", props: {}, children: [] },
    ],
  }]);

  await placeNewComponent("new");

  // 底边 = 16 + 80 = 96 → nextY = 96 + 24 = 120
  const entry = collabMaps()!.components.get("new") as { layout?: { x: number; y: number; w: number; h: number } };
  expect(entry.layout).toEqual({ x: 16, y: 120, w: 320, h: 80 });
});

test("placeNewComponent falls back to y=16 when no root component has a layout", async () => {
  initLocalCollabForTests();
  collabMaps()!.components.set("solo", { id: "solo", type: "button", props: {}, children: [] });
  collabMaps()!.index.set("solo", { parentId: null, pageId: "page-1", index: 0 });

  setState([{ id: "page-1", components: [{ id: "solo", type: "button", props: {}, children: [] }] }]);

  await placeNewComponent("solo");

  const entry = collabMaps()!.components.get("solo") as { layout?: { x: number; y: number; w: number; h: number } };
  expect(entry.layout).toEqual({ x: 16, y: 16, w: 320, h: 80 });
});
