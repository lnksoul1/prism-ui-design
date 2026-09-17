import { test, expect, vi, afterEach, beforeEach } from "vitest";
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

// 视口复位放在挂载前（afterEach 里 setState 会重渲染尚未卸载的组件，触发 act 告警）
beforeEach(() => {
  useDesignStore.setState({ view: { x: 0, y: 0, z: 1 } });
});

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

// ---- 无限画布 pan/zoom ----

function renderStage(): { container: HTMLElement; viewport: HTMLElement } {
  const { container } = render(<CanvasStage />);
  const viewport = container.querySelector(".canvas-viewport") as HTMLElement;
  expect(viewport).toBeTruthy();
  return { container, viewport };
}

test("plain wheel pans the viewport view", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false, view: { x: 0, y: 0, z: 1 } });
  const { viewport } = renderStage();

  fireEvent.wheel(viewport, { deltaX: 12, deltaY: 34 });

  // 滚轮向下/向右 = 内容向可视区下方/右方移动（视口位移取反）
  expect(useDesignStore.getState().view).toEqual({ x: -12, y: -34, z: 1 });
});

test("ctrl+wheel zooms at the cursor and keeps the content under it fixed", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false, view: { x: 100, y: 50, z: 1 } });
  const { viewport } = renderStage();

  // jsdom 的 getBoundingClientRect 全 0 → 光标视口坐标 = clientX/clientY
  fireEvent.wheel(viewport, { ctrlKey: true, clientX: 300, clientY: 200, deltaY: -100 });

  const v = useDesignStore.getState().view;
  expect(v.z).toBeCloseTo(Math.exp(0.15), 6); // factor = exp(-deltaY * 0.0015)
  // 光标下的内容点缩放前后不变: (300-x)/z 前后都是 200，(200-y)/z 前后都是 150
  expect((300 - v.x) / v.z).toBeCloseTo(200, 6);
  expect((200 - v.y) / v.z).toBeCloseTo(150, 6);
});

test("drop with a non-default view lands at the correct content coords", async () => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("comp_v", { id: "comp_v", type: "navbar", props: {}, children: [] });
  ydoc.getMap("index").set("comp_v", { parentId: null, pageId: "page-1", index: 1 });

  const { api } = await import("../../api");
  vi.mocked(api.addLibraryComponent).mockResolvedValueOnce({ success: true, component_id: "comp_v" });

  useDesignStore.setState({
    state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false,
    view: { x: 40, y: 20, z: 2 },
  });
  const { container } = renderStage();
  const stage = container.querySelector(".canvas-stage") as HTMLElement;

  // 内容坐标 = (clientX - rect.left - view.x) / view.z = (100-40)/2, (50-20)/2 = (30,15) → snap → (32,16)
  await act(async () => {
    fireEvent(stage, makeDropEvent("navbar_default", { clientX: 100, clientY: 50 }));
  });

  await waitFor(() => {
    expect((collabMaps()!.components.get("comp_v") as { layout?: unknown }).layout).toEqual({
      x: 32, y: 16, w: 320, h: 80,
    });
  });
});

test("dragging at zoom divides pointer deltas by the zoom level", () => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("c1", { id: "c1", type: "text", props: { text: "缩放拖拽" }, children: [], layout: { x: 16, y: 16, w: 100, h: 40 } });
  ydoc.getMap("index").set("c1", { parentId: null, pageId: "page-1", index: 0 });

  const base = {
    projectName: "P", style: "s", tokens: {},
    pages: [{ id: "page-1", name: "首页", components: [] }],
    currentPageId: "page-1", comments: [], revision: 1,
  } as unknown as DesignStateView;
  useDesignStore.setState({ state: null, baseState: base, selection: [], breakpoint: "desktop", playMode: false, view: { x: 0, y: 0, z: 2 } });
  useDesignStore.getState().applyServerState(base);

  const { container } = renderStage();
  const wrapper = container.querySelector('[data-prism-oid="c1"]') as HTMLElement;

  fireEvent.mouseDown(wrapper, { clientX: 20, clientY: 20 });
  fireEvent.mouseMove(document, { clientX: 100, clientY: 36 }); // 屏幕位移 (80,16)，z=2 → 内容位移 (40,8) → (56,24)
  fireEvent.mouseUp(document);

  const entry = collabMaps()!.components.get("c1") as { layout?: { x: number; y: number } };
  expect(entry.layout?.x).toBe(56);
  expect(entry.layout?.y).toBe(24);
});

test("+ / - keys zoom at the viewport center and 0 resets the view", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false, view: { x: 100, y: 50, z: 1 } });
  renderStage(); // jsdom rect 全 0 → 视口中心 = (0,0)

  fireEvent.keyDown(document, { key: "+" });
  let v = useDesignStore.getState().view;
  expect(v.z).toBeCloseTo(1.2, 10);
  expect(v.x).toBeCloseTo(120, 9); // 0 - (0-100)*1.2
  expect(v.y).toBeCloseTo(60, 9); // 0 - (0-50)*1.2

  fireEvent.keyDown(document, { key: "-" });
  v = useDesignStore.getState().view;
  expect(v.z).toBeCloseTo(1, 9);
  expect(v.x).toBeCloseTo(100, 9);
  expect(v.y).toBeCloseTo(50, 9);

  fireEvent.keyDown(document, { key: "+" });
  fireEvent.keyDown(document, { key: "0" }); // 复位
  expect(useDesignStore.getState().view).toEqual({ x: 0, y: 0, z: 1 });
});

test("zoom keys are ignored while typing in an input", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false, view: { x: 100, y: 50, z: 1 } });
  renderStage();
  const input = document.createElement("input");
  document.body.append(input);

  fireEvent.keyDown(input, { key: "+" });
  expect(useDesignStore.getState().view).toEqual({ x: 100, y: 50, z: 1 });
  input.remove();
});

test("space+drag pans with the hand tool and keeps the selection", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: ["comp-1"], playMode: false, view: { x: 0, y: 0, z: 1 } });
  const { viewport } = renderStage();

  fireEvent.keyDown(document, { code: "Space" });
  expect(viewport.className).toContain("space-pan");

  fireEvent.mouseDown(viewport, { button: 0, clientX: 100, clientY: 80 });
  expect(viewport.className).toContain("panning");
  fireEvent.mouseMove(document, { clientX: 140, clientY: 96 });
  fireEvent.mouseUp(document);
  fireEvent.keyUp(document, { code: "Space" });

  expect(useDesignStore.getState().view).toEqual({ x: 40, y: 16, z: 1 });
  expect(useDesignStore.getState().selection).toEqual(["comp-1"]); // 手型平移不清空选区
  expect(viewport.className).not.toContain("space-pan");
});

test("middle-mouse drag pans and does not clear the selection", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: ["comp-1"], playMode: false, view: { x: 0, y: 0, z: 1 } });
  const { viewport } = renderStage();

  fireEvent.mouseDown(viewport, { button: 1, clientX: 10, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: 30, clientY: 10 });
  fireEvent.mouseUp(document);

  expect(useDesignStore.getState().view).toEqual({ x: 20, y: 0, z: 1 });
  expect(useDesignStore.getState().selection).toEqual(["comp-1"]);
});

test("zoom hud shows the percent and its buttons zoom and reset", () => {
  useDesignStore.setState({ state: stateWithButton, breakpoint: "desktop", selection: [], playMode: false, view: { x: 0, y: 0, z: 1.5 } });
  renderStage();

  expect(screen.getByTestId("zoom-pct").textContent).toBe("150%");

  fireEvent.click(screen.getByTestId("zoom-out"));
  expect(useDesignStore.getState().view.z).toBeCloseTo(1.25, 9);
  expect(screen.getByTestId("zoom-pct").textContent).toBe("125%");

  fireEvent.click(screen.getByTestId("zoom-in"));
  expect(useDesignStore.getState().view.z).toBeCloseTo(1.5, 9);

  fireEvent.click(screen.getByTestId("zoom-reset"));
  expect(useDesignStore.getState().view).toEqual({ x: 0, y: 0, z: 1 });
  expect(screen.getByTestId("zoom-pct").textContent).toBe("100%");
});
