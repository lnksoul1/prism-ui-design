// client-v2/src/components/Canvas/Drag.test.tsx
import { test, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CanvasStage } from "./CanvasStage";
import { initLocalCollabForTests, collabMaps } from "../../collab/collab";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({ api: {} }));

test("dragging a selected component commits snapped layout to ydoc", () => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("c1", {
    id: "c1", type: "text", props: { text: "可拖" }, children: [], layout: { x: 16, y: 16, w: 100, h: 40 },
  });
  ydoc.getMap("index").set("c1", { parentId: null, pageId: "page-1", index: 0 });
  ydoc.getMap("components").set("c2", {
    id: "c2", type: "text", props: { text: "对齐目标" }, children: [], layout: { x: 200, y: 16, w: 100, h: 40 },
  });
  ydoc.getMap("index").set("c2", { parentId: null, pageId: "page-1", index: 1 });

  const base = {
    projectName: "P", style: "s", tokens: {},
    pages: [{ id: "page-1", name: "首页", components: [] }],
    currentPageId: "page-1", comments: [], revision: 1,
  } as unknown as DesignStateView;
  useDesignStore.setState({ state: null, baseState: base, selection: [], breakpoint: "desktop", cqWidth: null, playMode: false, linkMode: false });
  useDesignStore.getState().applyServerState(base); // 触发协同投影合并

  const { container } = render(<CanvasStage />);
  const wrapper = container.querySelector('[data-prism-oid="c1"]') as HTMLElement;

  fireEvent.mouseDown(wrapper, { clientX: 20, clientY: 20 });
  fireEvent.mouseMove(document, { clientX: 60, clientY: 24 }); // dx=40, dy=4 → raw(56,20) 网格吸附半格向下 → (56,16)，与 c2 顶边对齐
  fireEvent.mouseUp(document);

  const entry = collabMaps()!.components.get("c1") as { layout?: { x: number; y: number } };
  expect(entry.layout?.x).toBe(56);
  expect(entry.layout?.y).toBe(16);
});
