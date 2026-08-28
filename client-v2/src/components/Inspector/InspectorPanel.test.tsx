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
      id: "comp-1", type: "button", props: { text: "提交" }, children: [],
      layout: { x: 16, y: 16, w: 120, h: 40 },
      baseStyle: { background: "#1890ff", width: "120px" },
    }],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
} as unknown as DesignStateView;

beforeEach(() => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("comp-1", {
    id: "comp-1", type: "button", props: { text: "提交" }, children: [],
    layout: { x: 16, y: 16, w: 120, h: 40 },
    baseStyle: { background: "#1890ff", width: "120px" },
  });
  ydoc.getMap("index").set("comp-1", { parentId: null, pageId: "page-1", index: 0 });
});

test("shows selected component props and base style fields", () => {
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);
  expect(screen.getByText("button")).toBeTruthy();
  expect((screen.getByLabelText("text") as HTMLInputElement).value).toBe("提交");
  expect((screen.getByLabelText("background") as HTMLInputElement).value).toBe("#1890ff");
});

test("mobile breakpoint shows override editor and writes breakpoint override into ydoc", async () => {
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "mobile" });
  render(<InspectorPanel />);
  const input = screen.getByLabelText("width") as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, "80px");
  await userEvent.tab();
  const entry = collabMaps()!.components.get("comp-1") as { breakpointOverrides?: Record<string, Record<string, string>> };
  expect(entry.breakpointOverrides?.mobile).toEqual({ width: "80px" });
});
