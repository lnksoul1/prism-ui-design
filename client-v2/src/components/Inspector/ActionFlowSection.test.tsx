// client-v2/src/components/Inspector/ActionFlowSection.test.tsx
import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { useDesignStore } from "../../stores/design";
import { getCollab, initLocalCollabForTests } from "../../collab/collab";
import type { ActionFlowView, DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    createActionFlow: vi.fn().mockResolvedValue({ success: true }),
    updateActionFlow: vi.fn().mockResolvedValue({ success: true }),
    removeActionFlow: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const flow: ActionFlowView = {
  id: "flow-1", name: "点击提示", trigger: "click", componentId: "comp-1", enabled: true,
  steps: [{ id: "s1", action: "toast", params: { message: "hi" } }],
};

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{ id: "page-1", name: "首页", components: [
    { id: "comp-1", type: "button", props: {}, children: [], layout: { x: 0, y: 0, w: 100, h: 40 } },
  ]}],
  currentPageId: "page-1", comments: [], revision: 1, actionFlows: {},
} as unknown as DesignStateView;

beforeEach(() => {
  initLocalCollabForTests();
  // P3c: ActionFlow 数据源是协作 Y.Map —— 预置并选中组件
  getCollab().ydoc.getMap("actionFlows").set(flow.id, { ...flow });
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop", cqWidth: null });
});

test("lists flows of the selected component and edits steps via JSON into the collab map", async () => {
  const { api } = await import("../../api");
  render(<InspectorPanel />);
  expect(screen.getByText("交互流程")).toBeTruthy();
  const ta = screen.getByLabelText(/flow-1/) as HTMLTextAreaElement;
  expect(JSON.parse(ta.value).steps[0].params.message).toBe("hi");

  await userEvent.clear(ta);
  // 注意: userEvent.type 的 DSL 中 `{` 与 `[` 均需双写转义（`{{`/`[[`），`}`/`]` 为普通字符无需转义。
  await userEvent.type(ta, '{{"name":"改名","steps":[[{{"id":"s1","action":"toast","params":{{"message":"yo"}}]}');
  await userEvent.tab();
  // P3c: 编辑直写协作 Y.Map，不再走 REST
  const stored = getCollab().ydoc.getMap("actionFlows").get("flow-1") as ActionFlowView;
  expect(stored.name).toBe("改名");
  expect(stored.steps[0].params.message).toBe("yo");
  expect(api.updateActionFlow).not.toHaveBeenCalled();
});

test("invalid JSON shows error and does not commit", async () => {
  const { api } = await import("../../api");
  render(<InspectorPanel />);
  const ta = screen.getByLabelText(/flow-1/) as HTMLTextAreaElement;
  await userEvent.clear(ta);
  await userEvent.type(ta, "{{broken");
  await userEvent.tab();
  expect(screen.getByText(/JSON 格式错误/)).toBeTruthy();
  expect(api.updateActionFlow).not.toHaveBeenCalled();
  const stored = getCollab().ydoc.getMap("actionFlows").get("flow-1") as ActionFlowView;
  expect(stored.name).toBe("点击提示"); // 未被破坏
});

test("create button writes a default flow into the collab map", async () => {
  const { api } = await import("../../api");
  render(<InspectorPanel />);
  await userEvent.click(screen.getByRole("button", { name: "新建流程" }));
  const map = getCollab().ydoc.getMap("actionFlows");
  const created = Array.from(map.values()).find((f) => f.id !== "flow-1");
  expect(created?.componentId).toBe("comp-1");
  expect(created?.name).toBe("新流程");
  expect(created?.enabled).toBe(true);
  expect(api.createActionFlow).not.toHaveBeenCalled();
  // 新流程经 Y.Map 订阅即时出现在列表
  expect(await screen.findByText("新流程")).toBeTruthy();
});

test("delete button removes the flow from the collab map", async () => {
  const { api } = await import("../../api");
  render(<InspectorPanel />);
  await userEvent.click(screen.getByRole("button", { name: "删除" }));
  expect(getCollab().ydoc.getMap("actionFlows").get("flow-1")).toBeUndefined();
  expect(api.removeActionFlow).not.toHaveBeenCalled();
});
