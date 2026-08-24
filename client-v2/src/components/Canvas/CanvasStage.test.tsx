import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasStage } from "./CanvasStage";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

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
