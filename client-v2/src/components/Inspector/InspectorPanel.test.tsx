import { test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    setBaseStyle: vi.fn().mockResolvedValue({ success: true }),
    setBreakpointStyle: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{
    id: "page-1", name: "首页",
    components: [{
      id: "comp-1", type: "button", props: { text: "提交" }, children: [],
      layout: { x: 16, y: 16, w: 120, h: 40 },
      baseStyle: { background: "#1890ff", width: "120px" },
    }],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

test("shows selected component props and base style fields", () => {
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);
  expect(screen.getByText("button")).toBeTruthy();
  expect((screen.getByLabelText("text") as HTMLInputElement).value).toBe("提交");
  expect((screen.getByLabelText("background") as HTMLInputElement).value).toBe("#1890ff");
});

test("mobile breakpoint shows override editor and calls setBreakpointStyle", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "mobile" });
  render(<InspectorPanel />);
  const input = screen.getByLabelText("width") as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, "80px");
  await userEvent.tab();
  await waitFor(() =>
    expect(api.setBreakpointStyle).toHaveBeenCalledWith("comp-1", "mobile", { width: "80px" })
  );
});
