import { test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    setBoxMode: vi.fn().mockResolvedValue({ success: true }),
    setBaseStyle: vi.fn().mockResolvedValue({ success: true }),
    setBreakpointStyle: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{
    id: "page-1", name: "首页",
    components: [{
      id: "chart-1", type: "chart", props: {}, children: [],
      layout: { x: 16, y: 16, w: 400, h: 300 },
      boxMode: { enabled: true, internalConfig: { theme: "dark" } },
    }],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

test("shows box mode section with JSON editor for box-mode component", () => {
  useDesignStore.setState({ state, selection: ["chart-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);
  expect(screen.getByText("盒子模式")).toBeTruthy();
  const textarea = screen.getByLabelText("internalConfig") as HTMLTextAreaElement;
  expect(JSON.parse(textarea.value)).toEqual({ theme: "dark" });
});

test("valid JSON commits setBoxMode; invalid JSON shows error and does not commit", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: ["chart-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);
  const textarea = screen.getByLabelText("internalConfig") as HTMLTextAreaElement;

  await userEvent.clear(textarea);
  await userEvent.type(textarea, '{{"theme":"light"}');
  await userEvent.tab();
  await waitFor(() =>
    expect(api.setBoxMode).toHaveBeenCalledWith("chart-1", expect.objectContaining({ internalConfig: { theme: "light" } }))
  );

  await userEvent.clear(textarea);
  await userEvent.type(textarea, "{{broken json");
  await userEvent.tab();
  expect(screen.getByText(/JSON 格式错误/)).toBeTruthy();
  expect(api.setBoxMode).toHaveBeenCalledTimes(1);
});
