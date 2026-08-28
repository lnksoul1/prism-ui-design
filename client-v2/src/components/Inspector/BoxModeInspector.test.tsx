import { test, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { useDesignStore } from "../../stores/design";
import { initLocalCollabForTests, collabMaps } from "../../collab/collab";
import type { DesignStateView } from "../../types";

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

beforeEach(() => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("chart-1", {
    id: "chart-1", type: "chart", props: {}, children: [],
    layout: { x: 16, y: 16, w: 400, h: 300 },
    boxMode: { enabled: true, internalConfig: { theme: "dark" } },
  });
  ydoc.getMap("index").set("chart-1", { parentId: null, pageId: "page-1", index: 0 });
});

test("shows box mode section with JSON editor for box-mode component", () => {
  useDesignStore.setState({ state, selection: ["chart-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);
  expect(screen.getByText("盒子模式")).toBeTruthy();
  const textarea = screen.getByLabelText("internalConfig") as HTMLTextAreaElement;
  expect(JSON.parse(textarea.value)).toEqual({ theme: "dark" });
});

test("valid JSON commits box mode into ydoc; invalid JSON shows error and does not commit", async () => {
  useDesignStore.setState({ state, selection: ["chart-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);
  const textarea = screen.getByLabelText("internalConfig") as HTMLTextAreaElement;

  // 非法 JSON: 显示错误，ydoc 未提交（internalConfig 保持 seed 值）
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "{{broken json");
  await userEvent.tab();
  expect(screen.getByText(/JSON 格式错误/)).toBeTruthy();
  const before = collabMaps()!.components.get("chart-1") as { boxMode?: { internalConfig: Record<string, unknown> } };
  expect(before.boxMode?.internalConfig).toEqual({ theme: "dark" });

  // 合法 JSON: 提交进协同文档
  await userEvent.clear(textarea);
  await userEvent.type(textarea, '{{"theme":"light"}');
  await userEvent.tab();
  const entry = collabMaps()!.components.get("chart-1") as { boxMode?: { internalConfig: Record<string, unknown> } };
  expect(entry.boxMode?.internalConfig).toEqual({ theme: "light" });
});
