// client-v2/src/components/PlayMode.test.tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasStage } from "./Canvas/CanvasStage";
import { useDesignStore } from "../stores/design";
import type { DesignStateView } from "../types";

vi.mock("../api", () => ({
  api: {
    getState: vi.fn(),
    addPageLink: vi.fn(),
    removePageLink: vi.fn(),
  },
}));

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [
    { id: "page-1", name: "首页", components: [
      { id: "btn-1", type: "button", props: { text: "去详情" }, children: [], layout: { x: 16, y: 16, w: 120, h: 40 } },
      { id: "flow-btn", type: "button", props: { text: "弹提示" }, children: [], layout: { x: 16, y: 100, w: 120, h: 40 } },
      { id: "tgt", type: "text", props: { text: "被切换的" }, children: [], layout: { x: 16, y: 180, w: 120, h: 40 } },
      { id: "nav-btn", type: "button", props: { text: "行为跳转" }, children: [], layout: { x: 16, y: 260, w: 120, h: 40 },
        behavior: { type: "navigate", page_id: "page-2" } },
    ]},
    { id: "page-2", name: "详情页", components: [
      { id: "detail", type: "text", props: { text: "详情内容" }, children: [], layout: { x: 16, y: 16, w: 200, h: 40 } },
    ]},
  ],
  currentPageId: "page-1",
  comments: [],
  pageLinks: [{ id: "link-1", from_page_id: "page-1", to_page_id: "page-2", source_component_id: "btn-1", transition: "slide-left" }],
  actionFlows: {
    "flow-1": { id: "flow-1", name: "f", trigger: "click", componentId: "flow-btn", enabled: true,
      steps: [
        { id: "s1", action: "toast", params: { message: "你好 Prisma" } },
        { id: "s2", action: "toggle", params: { component_id: "tgt" } },
      ] },
  },
  revision: 1,
} as unknown as DesignStateView;

function enterPlay(): void {
  useDesignStore.setState({
    state, selection: [], breakpoint: "desktop", cqWidth: null,
    playMode: true, previewPageId: null, previewTransition: null, hiddenIds: [], toastMsg: null, linkMode: false,
  });
}

test("page link navigates to the target page in play mode", async () => {
  enterPlay();
  render(<CanvasStage />);
  expect(screen.getByText("去详情")).toBeTruthy();
  await userEvent.click(screen.getByText("去详情"));
  expect(screen.getByText("详情内容")).toBeTruthy();
  expect(screen.queryByText("去详情")).toBeNull();
});

test("action flow runs toast and toggle effects", async () => {
  enterPlay();
  render(<CanvasStage />);
  await userEvent.click(screen.getByText("弹提示"));
  expect(screen.getByText("你好 Prisma")).toBeTruthy();
  expect(screen.queryByText("被切换的")).toBeNull(); // toggle 隐藏
});

test("page link transition drives the preview page enter animation", async () => {
  enterPlay();
  render(<CanvasStage />);
  await userEvent.click(screen.getByText("去详情"));
  const container = document.querySelector('[data-testid="preview-page"]') as HTMLElement;
  expect(container).toBeTruthy();
  expect(container.className).toContain("pt-slide-left");
  expect(useDesignStore.getState().previewTransition).toBe("slide-left");
});

test("behavior navigate falls back to the fade transition", async () => {
  enterPlay();
  render(<CanvasStage />);
  await userEvent.click(screen.getByText("行为跳转"));
  const container = document.querySelector('[data-testid="preview-page"]') as HTMLElement;
  expect(container).toBeTruthy();
  expect(container.className).toContain("pt-fade");
  expect(useDesignStore.getState().previewTransition).toBe("fade");
});
