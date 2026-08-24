import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasStage } from "./CanvasStage";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{
    id: "page-1", name: "首页",
    components: [
      { id: "chart-1", type: "chart", props: {}, children: [{ id: "inner", type: "text", props: { text: "内部" }, children: [] }], layout: { x: 16, y: 16, w: 400, h: 300 }, boxMode: { enabled: true, internalConfig: {} } },
      { id: "plain-1", type: "text", props: { text: "普通" }, children: [], layout: { x: 16, y: 400, w: 200, h: 40 } },
    ],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

test("box-mode component renders placeholder, inner children not rendered", () => {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop" });
  render(<CanvasStage />);
  expect(document.querySelector('[data-prism-oid="chart-1"] .box-mode-placeholder')).toBeTruthy();
  expect(screen.queryByText("内部")).toBeNull();
  expect(screen.getByText("普通")).toBeTruthy();
});

test("clicking box-mode placeholder selects the component", async () => {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop" });
  render(<CanvasStage />);
  await userEvent.click(screen.getByText("chart"));
  expect(useDesignStore.getState().selection).toEqual(["chart-1"]);
});
