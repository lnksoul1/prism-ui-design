// client-v2/src/components/Canvas/Resize.test.tsx — M4 组件调整大小
import { test, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { CanvasStage } from "./CanvasStage";
import { initLocalCollabForTests, collabMaps } from "../../collab/collab";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({ api: {} }));

function setup(selection: string[] = ["c1"]): { container: HTMLElement } {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("c1", {
    id: "c1", type: "card", props: { title: "卡片" }, children: [],
    layout: { x: 16, y: 16, w: 100, h: 40 },
  });
  ydoc.getMap("index").set("c1", { parentId: null, pageId: "page-1", index: 0 });

  const base = {
    projectName: "P", style: "s", tokens: {},
    pages: [{ id: "page-1", name: "首页", components: [] }],
    currentPageId: "page-1", comments: [], revision: 1,
  } as unknown as DesignStateView;
  useDesignStore.setState({
    state: null, baseState: base, selection, breakpoint: "desktop",
    cqWidth: null, playMode: false, linkMode: false,
  });
  useDesignStore.getState().applyServerState(base); // 触发协同投影合并

  return { container: render(<CanvasStage />).container };
}

test("resize handle grows the box live and commits snapped w/h on mouseup", () => {
  const { container } = setup();
  const wrapper = container.querySelector('[data-prism-oid="c1"]') as HTMLElement;
  const handle = wrapper.querySelector('[data-testid="resize-handle"]') as HTMLElement;
  expect(handle).toBeTruthy();

  fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
  fireEvent.mouseMove(document, { clientX: 180, clientY: 140 }); // +80 x / +40 y → 180 × 80

  // 实时预览：宽高被 resizeBox 覆盖（尚未提交）
  expect(wrapper.style.width).toBe("180px");
  expect(wrapper.style.minHeight).toBe("80px");

  fireEvent.mouseUp(document);

  // 提交：snapValue(180)=176，snapValue(80)=80
  const entry = collabMaps()!.components.get("c1") as { layout?: { w: number; h: number } };
  expect(entry.layout?.w).toBe(176);
  expect(entry.layout?.h).toBe(80);
});

test("resize never shrinks the box below 32x32", () => {
  const { container } = setup();
  const wrapper = container.querySelector('[data-prism-oid="c1"]') as HTMLElement;
  const handle = wrapper.querySelector('[data-testid="resize-handle"]') as HTMLElement;

  fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
  fireEvent.mouseMove(document, { clientX: -200, clientY: -200 }); // 大幅反向拖动

  expect(wrapper.style.width).toBe("32px");
  expect(wrapper.style.minHeight).toBe("32px");
  fireEvent.mouseUp(document);

  const entry = collabMaps()!.components.get("c1") as { layout?: { w: number; h: number } };
  expect(entry.layout?.w).toBe(32);
  expect(entry.layout?.h).toBe(32);
});

test("resize handle only renders for the single selected root outside play mode", () => {
  const { container } = setup([]);
  const wrapper = container.querySelector('[data-prism-oid="c1"]') as HTMLElement;
  expect(wrapper.querySelector('[data-testid="resize-handle"]')).toBeNull();

  act(() => { useDesignStore.setState({ selection: ["c1"] }); });
  expect(container.querySelector('[data-testid="resize-handle"]')).toBeTruthy();

  act(() => { useDesignStore.setState({ playMode: true }); });
  expect(container.querySelector('[data-testid="resize-handle"]')).toBeNull();
});
