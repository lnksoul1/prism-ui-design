// client-v2/src/components/Canvas/LinkLayer.test.tsx
import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkLayer } from "./LinkLayer";
import { useDesignStore } from "../../stores/design";
import { getCollab, initLocalCollabForTests } from "../../collab/collab";
import type { DesignStateView, PageLinkView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    addPageLink: vi.fn().mockResolvedValue({ success: true }),
    removePageLink: vi.fn().mockResolvedValue({ success: true }),
  },
}));

beforeEach(() => {
  initLocalCollabForTests();
});

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [
    { id: "page-1", name: "首页", components: [
      { id: "comp-1", type: "button", props: { text: "去详情" }, children: [], layout: { x: 100, y: 100, w: 120, h: 40 } },
    ]},
    { id: "page-2", name: "详情页", components: [] },
  ],
  currentPageId: "page-1",
  comments: [],
  pageLinks: [],
  revision: 1,
} as unknown as DesignStateView;

const links: PageLinkView[] = [
  { id: "link-1", from_page_id: "page-1", to_page_id: "page-2", source_component_id: "comp-1", transition: "slide-left" },
];

/** P3b: 连线数据源是协作 Y.Map —— 测试里经本地 doc 预置。 */
function seedLinks(list: PageLinkView[]): void {
  const map = getCollab().ydoc.getMap("pageLinks");
  for (const l of list) map.set(l.id, { ...l });
}

function setup(): void {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", linkMode: true, pendingLinkSource: null });
  seedLinks(links);
}

test("renders a bezier path for the page link anchored at the component", () => {
  setup();
  render(<LinkLayer page={state.pages[0]} />);
  const path = document.querySelector('[data-testid="page-link-link-1"]') as SVGPathElement;
  expect(path).toBeTruthy();
  // 锚点 = 组件右中: (100+120, 100+20) = 220,120
  expect(path.getAttribute("d")).toContain("M 220 120");
});

test("shows the transition as a tiny label on the link", () => {
  setup();
  render(<LinkLayer page={state.pages[0]} />);
  expect(screen.getByText("详情页 · 左滑")).toBeTruthy();
});

test("clicking a target page chip with pending source writes the link into the collab map", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", linkMode: true, pendingLinkSource: "comp-1" });
  render(<LinkLayer page={state.pages[0]} />);
  await userEvent.click(screen.getByTestId("page-chip-page-2"));
  const map = getCollab().ydoc.getMap("pageLinks");
  const stored = Array.from(map.values()).find((l) => l.to_page_id === "page-2");
  expect(stored?.from_page_id).toBe("page-1");
  expect(stored?.source_component_id).toBe("comp-1");
  expect(stored?.transition).toBe("fade"); // 默认转场
  // P3b: 不再走 REST
  expect(api.addPageLink).not.toHaveBeenCalled();
  // 「每源组件一条」: 重连到同一 chip 不产生第二条出边
  await userEvent.click(screen.getByTestId("page-chip-page-2"));
  expect(Array.from(map.values()).filter((l) => l.source_component_id === "comp-1").length).toBe(1);
});

test("clicking a link path selects its source component instead of deleting", async () => {
  const { api } = await import("../../api");
  setup();
  render(<LinkLayer page={state.pages[0]} />);
  await userEvent.click(screen.getByTestId("page-link-link-1"));
  expect(useDesignStore.getState().selection).toEqual(["comp-1"]);
  expect(useDesignStore.getState().pendingLinkSource).toBeNull();
  expect(api.removePageLink).not.toHaveBeenCalled();
});

test("remote link update re-renders the transition label", async () => {
  setup();
  render(<LinkLayer page={state.pages[0]} />);
  expect(screen.getByText("详情页 · 左滑")).toBeTruthy();
  // 模拟远端/服务端 reconcile 写入
  const map = getCollab().ydoc.getMap("pageLinks");
  map.set("link-1", { ...links[0], transition: "expand" });
  expect(await screen.findByText("详情页 · 展开")).toBeTruthy();
});
