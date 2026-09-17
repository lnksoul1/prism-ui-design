// client-v2/src/components/Canvas/LinkLayer.test.tsx
import { test, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkLayer } from "./LinkLayer";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    addPageLink: vi.fn().mockResolvedValue({ success: true }),
    removePageLink: vi.fn().mockResolvedValue({ success: true }),
  },
}));
afterEach(() => vi.clearAllMocks());

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
  pageLinks: [
    { id: "link-1", from_page_id: "page-1", to_page_id: "page-2", source_component_id: "comp-1", transition: "slide-left" },
  ],
  revision: 1,
} as unknown as DesignStateView;

test("renders a bezier path for the page link anchored at the component", () => {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", linkMode: true, pendingLinkSource: null });
  render(<LinkLayer page={state.pages[0]} />);
  const path = document.querySelector('[data-testid="page-link-link-1"]') as SVGPathElement;
  expect(path).toBeTruthy();
  // 锚点 = 组件右中: (100+120, 100+20) = 220,120
  expect(path.getAttribute("d")).toContain("M 220 120");
});

test("shows the transition as a tiny label on the link", () => {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", linkMode: true, pendingLinkSource: null });
  render(<LinkLayer page={state.pages[0]} />);
  expect(screen.getByText("详情页 · 左滑")).toBeTruthy();
});

test("clicking a target page chip with pending source creates the link with the default transition", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", linkMode: true, pendingLinkSource: "comp-1" });
  render(<LinkLayer page={state.pages[0]} />);
  await userEvent.click(screen.getByTestId("page-chip-page-2"));
  expect(api.addPageLink).toHaveBeenCalledWith({
    from_page_id: "page-1", to_page_id: "page-2", source_component_id: "comp-1", transition: "fade",
  });
});

test("clicking a link path selects its source component instead of deleting", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", linkMode: true, pendingLinkSource: "comp-1" });
  render(<LinkLayer page={state.pages[0]} />);
  await userEvent.click(screen.getByTestId("page-link-link-1"));
  expect(useDesignStore.getState().selection).toEqual(["comp-1"]);
  expect(useDesignStore.getState().pendingLinkSource).toBeNull();
  expect(api.removePageLink).not.toHaveBeenCalled();
});
