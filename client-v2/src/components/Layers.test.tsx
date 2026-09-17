// client-v2/src/components/Layers.test.tsx — 图层面板: z 序展示/选中/拖拽排序
import { test, expect, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { Layers } from "./Layers";
import { initLocalCollabForTests } from "../collab/collab";
import { useDesignStore } from "../stores/design";
import type { DesignStateView } from "../types";

const base = {
  projectName: "P", style: "s", tokens: {},
  pages: [{ id: "page-1", name: "首页", components: [] }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

/** 种子: page-1 根层级 c1(背景层)/c2(卡片)/c3(标题) 底→顶，c2 下挂子组件 k1。 */
function seed(): ReturnType<typeof initLocalCollabForTests> {
  const inst = initLocalCollabForTests();
  const add = (id: string, name: string, i: number, parentId: string | null, variant?: string): void => {
    inst.ydoc.getMap("components").set(id, { id, type: "text", name, variant, props: {}, children: [] });
    inst.ydoc.getMap("index").set(id, { parentId, pageId: "page-1", index: i });
  };
  add("c1", "背景层", 0, null);
  add("c2", "卡片", 1, null);
  add("k1", "卡片子项", 0, "c2");
  add("c3", "标题", 2, null, "大标题");
  useDesignStore.setState({ state: null, baseState: base, selection: [], playMode: false });
  useDesignStore.getState().applyServerState(base); // 触发协同投影合并
  return inst;
}

const rowNames = (): Array<string | undefined> =>
  screen.getAllByTestId("layers-row").map((r) => r.querySelector(".layers-name")?.textContent);

const rowOf = (name: string): HTMLElement => {
  const row = screen.getAllByTestId("layers-row").find((r) => r.querySelector(".layers-name")?.textContent === name);
  if (!row) throw new Error(`row not found: ${name}`);
  return row;
};

/** jsdom 未实现 DataTransfer：手工构造带 setData/getData 桩的拖拽事件。 */
function makeDataTransfer(): { setData: ReturnType<typeof vi.fn>; getData: ReturnType<typeof vi.fn>; effectAllowed: string; dropEffect: string } {
  const store = new Map<string, string>();
  return {
    setData: vi.fn((t: string, v: string) => void store.set(t, v)),
    getData: vi.fn((t: string) => store.get(t) ?? ""),
    effectAllowed: "",
    dropEffect: "",
  };
}
function dragEvent(type: string, dt: unknown): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  (e as unknown as { dataTransfer: unknown }).dataTransfer = dt;
  return e;
}

test("renders current page rows top-first in z-order, children indented and non-draggable", () => {
  seed();
  render(<Layers />);
  // 顶→底: 标题, 卡片(+子项), 背景层
  expect(rowNames()).toEqual(["标题", "卡片", "卡片子项", "背景层"]);
  expect(screen.getByTestId("layers-panel").querySelector(".panel-title")?.textContent).toBe("图层");

  const child = rowOf("卡片子项");
  expect(child.classList.contains("layers-row--child")).toBe(true);
  expect(child.draggable).toBe(false); // v1: 子组件不可拖拽
  expect(rowOf("标题").draggable).toBe(true); // 根层级可拖拽
  expect(rowOf("标题").querySelector(".layers-variant")?.textContent).toBe("大标题");
});

test("clicking a row selects the component with canvas selection semantics", () => {
  seed();
  render(<Layers />);
  fireEvent.click(rowOf("卡片"));
  expect(useDesignStore.getState().selection).toEqual(["c2"]);
  const selected = screen.getAllByTestId("layers-row").filter((r) => r.classList.contains("selected"));
  expect(selected.map((r) => r.querySelector(".layers-name")?.textContent)).toEqual(["卡片"]);

  fireEvent.click(rowOf("卡片子项"));
  expect(useDesignStore.getState().selection).toEqual(["k1"]);
});

test("drag-drop reorders z-order via a single ydoc transaction", () => {
  const inst = seed();
  render(<Layers />);
  const dt = makeDataTransfer();

  fireEvent(rowOf("背景层"), dragEvent("dragstart", dt)); // 拖最底层
  expect(dt.setData).toHaveBeenCalledWith("text/prism-layers-id", "c1");
  expect(dt.effectAllowed).toBe("move");
  fireEvent(rowOf("标题"), dragEvent("dragover", dt)); // 悬停最顶层 → 插到其上
  fireEvent(rowOf("标题"), dragEvent("drop", dt));

  // c1 置顶: 显示序 [c1, c3, c2] → 数组序（底→顶）[c2, c3, c1]
  const index = inst.ydoc.getMap("index");
  expect((index.get("c1") as { index: number }).index).toBe(2);
  expect((index.get("c2") as { index: number }).index).toBe(0);
  expect((index.get("c3") as { index: number }).index).toBe(1);
  expect((index.get("k1") as { index: number }).index).toBe(0); // 子组件不动
  expect(inst.undoManager.undoStack.length).toBe(1); // 单 undo 步

  // 重放服务端状态合并后（生产由 App 的 observeDeep 驱动），面板顺序更新
  act(() => {
    useDesignStore.getState().applyServerState(base);
  });
  expect(rowNames()).toEqual(["背景层", "标题", "卡片", "卡片子项"]);
});

test("dropping on the last row moves the dragged component to the bottom", () => {
  const inst = seed();
  render(<Layers />);
  const dt = makeDataTransfer();
  fireEvent(rowOf("标题"), dragEvent("dragstart", dt)); // 拖最顶层
  fireEvent(rowOf("背景层"), dragEvent("dragover", dt)); // 悬停最底层（末行）
  fireEvent(rowOf("背景层"), dragEvent("drop", dt));

  // c3 置底: 显示序 [c2, c1, c3] → 数组序 [c3, c1, c2]
  const index = inst.ydoc.getMap("index");
  expect((index.get("c3") as { index: number }).index).toBe(0);
  expect((index.get("c1") as { index: number }).index).toBe(1);
  expect((index.get("c2") as { index: number }).index).toBe(2);
});

test("drop without a prior dragstart is ignored", () => {
  const inst = seed();
  render(<Layers />);
  fireEvent(rowOf("标题"), dragEvent("drop", makeDataTransfer()));
  expect(inst.undoManager.undoStack.length).toBe(0);
  expect((inst.ydoc.getMap("index").get("c3") as { index: number }).index).toBe(2);
});
