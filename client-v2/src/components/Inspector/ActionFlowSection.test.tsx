// client-v2/src/components/Inspector/ActionFlowSection.test.tsx
import { test, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    createActionFlow: vi.fn().mockResolvedValue({ success: true }),
    updateActionFlow: vi.fn().mockResolvedValue({ success: true }),
    removeActionFlow: vi.fn().mockResolvedValue({ success: true }),
  },
}));
afterEach(() => vi.clearAllMocks());

const flow = {
  id: "flow-1", name: "点击提示", trigger: "click", componentId: "comp-1", enabled: true,
  steps: [{ id: "s1", action: "toast", params: { message: "hi" } }],
};

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{ id: "page-1", name: "首页", components: [
    { id: "comp-1", type: "button", props: {}, children: [], layout: { x: 0, y: 0, w: 100, h: 40 } },
  ]}],
  currentPageId: "page-1", comments: [], revision: 1, actionFlows: { "flow-1": flow },
} as unknown as DesignStateView;

test("lists flows of the selected component and edits steps via JSON", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop", cqWidth: null });
  render(<InspectorPanel />);
  expect(screen.getByText("交互流程")).toBeTruthy();
  const ta = screen.getByLabelText(/flow-1/) as HTMLTextAreaElement;
  expect(JSON.parse(ta.value).steps[0].params.message).toBe("hi");

  await userEvent.clear(ta);
  // 注意: userEvent.type 的 DSL 中 `{` 与 `[` 均需双写转义（`{{`/`[[`），`}`/`]` 为普通字符无需转义。
  await userEvent.type(ta, '{{"name":"改名","steps":[[{{"id":"s1","action":"toast","params":{{"message":"yo"}}]}');
  await userEvent.tab();
  expect(api.updateActionFlow).toHaveBeenCalledWith("flow-1", expect.objectContaining({
    name: "改名",
    steps: [{ id: "s1", action: "toast", params: { message: "yo" } }],
  }));
});

test("invalid JSON shows error and does not commit", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop", cqWidth: null });
  render(<InspectorPanel />);
  const ta = screen.getByLabelText(/flow-1/) as HTMLTextAreaElement;
  await userEvent.clear(ta);
  await userEvent.type(ta, "{{broken");
  await userEvent.tab();
  expect(screen.getByText(/JSON 格式错误/)).toBeTruthy();
  expect(api.updateActionFlow).not.toHaveBeenCalled();
});

test("create button posts a default flow for the component", async () => {
  const { api } = await import("../../api");
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop", cqWidth: null });
  render(<InspectorPanel />);
  await userEvent.click(screen.getByRole("button", { name: "新建流程" }));
  expect(api.createActionFlow).toHaveBeenCalledWith(expect.objectContaining({ componentId: "comp-1" }));
});
