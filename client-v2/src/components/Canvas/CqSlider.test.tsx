import { test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasStage } from "./CanvasStage";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{
    id: "page-1", name: "首页",
    components: [{ id: "comp-1", type: "card", props: {}, children: [], layout: { x: 16, y: 16, w: 300, h: 200 } }],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

test("slider appears when a component is selected; dragging sets container width", async () => {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", cqWidth: null });
  render(<CanvasStage />);
  expect(screen.queryByTestId("cq-slider")).toBeNull();

  await userEvent.click(document.querySelector('[data-prism-oid="comp-1"]') as HTMLElement);
  expect(useDesignStore.getState().selection).toEqual(["comp-1"]);

  const slider = screen.getByTestId("cq-slider") as HTMLInputElement;
  expect(slider).toBeTruthy();
  fireEvent.change(slider, { target: { value: "480" } });
  expect(useDesignStore.getState().cqWidth).toBe(480);

  const wrapper = document.querySelector('[data-prism-oid="comp-1"]') as HTMLElement;
  expect(wrapper.style.containerType).toBe("inline-size");
  expect(wrapper.style.width).toBe("480px");
});

test("reset button clears cqWidth and container styles", async () => {
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop", cqWidth: 480 });
  render(<CanvasStage />);
  await userEvent.click(screen.getByRole("button", { name: "关闭容器模拟" }));
  expect(useDesignStore.getState().cqWidth).toBe(null);
  const wrapper = document.querySelector('[data-prism-oid="comp-1"]') as HTMLElement;
  expect(wrapper.style.containerType).toBe("");
});
