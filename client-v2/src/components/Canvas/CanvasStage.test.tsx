import { test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasStage } from "./CanvasStage";
import { initLocalCollabForTests, collabMaps } from "../../collab/collab";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    addLibraryComponent: vi.fn().mockResolvedValue({
      success: true,
      mode: "added",
      component_id: "comp-9",
    }),
  },
}));

afterEach(() => vi.clearAllMocks());

const stateWithButton = {
  projectName: "P", style: "s", tokens: {},
  pages: [{
    id: "page-1", name: "首页",
    components: [{
      id: "comp-1", type: "button", props: { text: "提交" }, children: [],
      layout: { x: 16, y: 16, w: 120, h: 40 },
      baseStyle: { background: "#1890ff" },
      breakpointOverrides: { mobile: { background: "#ff4d4f" } },
    }],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

test("renders component with base style at desktop breakpoint", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [] });
  render(<CanvasStage />);
  const btn = screen.getByText("提交");
  expect(btn).toBeTruthy();
  // button 内容在 wrapper 内，wrapper 承载样式：desktop 用 base 样式
  const wrapper = document.querySelector('[data-prism-oid="comp-1"]') as HTMLElement;
  expect(wrapper.style.background).toBe("rgb(24, 144, 255)");
});

test("click selects component; mobile breakpoint applies override", async () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "mobile", selection: [] });
  render(<CanvasStage />);
  await userEvent.click(screen.getByText("提交"));
  expect(useDesignStore.getState().selection).toEqual(["comp-1"]);
  // 断点合并：mobile 覆盖 background
  const wrapper = document.querySelector('[data-prism-oid="comp-1"]') as HTMLElement;
  expect(wrapper.style.background).toBe("rgb(255, 77, 79)");
});

/** jsdom 未实现 DataTransfer：手工构造带 getData/setData 桩的 drop 事件（MouseEvent 携带落点坐标）。 */
function makeDropEvent(componentId: string | null, coords?: { clientX: number; clientY: number }): Event {
  const store = new Map<string, string>();
  if (componentId) store.set("text/prism-library-component", componentId);
  const drop = new MouseEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: coords?.clientX ?? 0,
    clientY: coords?.clientY ?? 0,
  });
  (drop as unknown as { dataTransfer: unknown }).dataTransfer = {
    getData: (type: string): string => store.get(type) ?? "",
    setData: (type: string, value: string): void => void store.set(type, value),
  };
  return drop;
}

test("drop with library payload adds the component and selects returned component_id", async () => {
  // 预置服务端将返回的 comp-9（waitForComponent 立即命中，随后提交落点布局）
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("comp-9", { id: "comp-9", type: "navbar", props: {}, children: [] });
  ydoc.getMap("index").set("comp-9", { parentId: null, pageId: "page-1", index: 1 });

  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false });
  const { container } = render(<CanvasStage />);
  const stage = container.querySelector(".canvas-stage") as HTMLElement;

  // act 包裹: drop 的异步续体里会 setState 选中新组件
  await act(async () => {
    fireEvent(stage, makeDropEvent("navbar_default"));
  });

  const { api } = await import("../../api");
  await waitFor(() => expect(api.addLibraryComponent).toHaveBeenCalledWith("navbar_default"));
  expect(useDesignStore.getState().selection).toEqual(["comp-9"]);
});

test("drop commits the snapped drop point as the new component layout", async () => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("comp_test", { id: "comp_test", type: "navbar", props: {}, children: [] });
  ydoc.getMap("index").set("comp_test", { parentId: null, pageId: "page-1", index: 1 });

  const { api } = await import("../../api");
  vi.mocked(api.addLibraryComponent).mockResolvedValueOnce({ success: true, component_id: "comp_test" });

  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false });
  const { container } = render(<CanvasStage />);
  const stage = container.querySelector(".canvas-stage") as HTMLElement;

  // jsdom 的 getBoundingClientRect 全 0 → 落点 = clientX/clientY；snapValue(100)=96, snapValue(50)=48
  await act(async () => {
    fireEvent(stage, makeDropEvent("navbar_default", { clientX: 100, clientY: 50 }));
  });

  await waitFor(() => {
    expect((collabMaps()!.components.get("comp_test") as { layout?: unknown }).layout).toEqual({
      x: 96, y: 48, w: 320, h: 80,
    });
  });
});

test("dragging a component without layout commits a fresh snapped layout", () => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("c1", { id: "c1", type: "text", props: { text: "无布局" }, children: [] });
  ydoc.getMap("index").set("c1", { parentId: null, pageId: "page-1", index: 0 });

  const base = {
    projectName: "P", style: "s", tokens: {},
    pages: [{ id: "page-1", name: "首页", components: [] }],
    currentPageId: "page-1", comments: [], revision: 1,
  } as unknown as DesignStateView;
  useDesignStore.setState({ state: null, baseState: base, selection: [], breakpoint: "desktop", cqWidth: null, playMode: false, linkMode: false });
  useDesignStore.getState().applyServerState(base); // 触发协同投影合并

  const { container } = render(<CanvasStage />);
  const wrapper = container.querySelector('[data-prism-oid="c1"]') as HTMLElement;
  expect(wrapper).toBeTruthy();

  fireEvent.mouseDown(wrapper, { clientX: 20, clientY: 20 });
  fireEvent.mouseMove(document, { clientX: 60, clientY: 28 }); // dx=40, dy=8 → 基点(16,0) → raw(56,8)，无其他组件 → 不吸附
  fireEvent.mouseUp(document);

  const entry = collabMaps()!.components.get("c1") as { layout?: { x: number; y: number; w: number; h: number } };
  expect(entry.layout).toEqual({ x: 56, y: 8, w: 320, h: 80 });
});

test("drop without library payload does not call the API", async () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false });
  const { container } = render(<CanvasStage />);
  const stage = container.querySelector(".canvas-stage") as HTMLElement;

  fireEvent(stage, makeDropEvent(null));

  const { api } = await import("../../api");
  expect(api.addLibraryComponent).not.toHaveBeenCalled();
  expect(useDesignStore.getState().selection).toEqual([]);
});

test("drop is ignored when play mode is on", async () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: true });
  const { container } = render(<CanvasStage />);
  const stage = container.querySelector(".canvas-stage") as HTMLElement;

  fireEvent(stage, makeDropEvent("navbar_default"));

  const { api } = await import("../../api");
  expect(api.addLibraryComponent).not.toHaveBeenCalled();
  expect(useDesignStore.getState().selection).toEqual([]);
});
