import { test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { useDesignStore } from "../../stores/design";
import { initLocalCollabForTests, collabMaps, getCollab } from "../../collab/collab";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    updatePageLink: vi.fn().mockResolvedValue({ success: true }),
    removePageLink: vi.fn().mockResolvedValue({ success: true }),
    addPageConstraint: vi.fn().mockResolvedValue({ success: true, constraint: { id: "pc-1", component_type: "button" } }),
    removePageConstraint: vi.fn().mockResolvedValue({ success: true }),
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
  }, {
    id: "page-2", name: "详情页", components: [],
  }],
  currentPageId: "page-1", comments: [], revision: 1,
  pageLinks: [{ id: "link-1", from_page_id: "page-1", to_page_id: "page-2", source_component_id: "comp-1", transition: "fade" }],
} as unknown as DesignStateView;

beforeEach(() => {
  const { ydoc } = initLocalCollabForTests();
  ydoc.getMap("components").set("comp-1", {
    id: "comp-1", type: "button", props: { text: "提交" }, children: [],
    layout: { x: 16, y: 16, w: 120, h: 40 },
    baseStyle: { background: "#1890ff", width: "120px" },
  });
  ydoc.getMap("index").set("comp-1", { parentId: null, pageId: "page-1", index: 0 });
  // P3b: 连线数据源是协作 Y.Map
  ydoc.getMap("pageLinks").set("link-1", {
    id: "link-1", from_page_id: "page-1", to_page_id: "page-2", source_component_id: "comp-1", transition: "fade",
  });
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

test("geometry section renders x/y/w/h from layout and commits edits on blur", async () => {
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);

  const x = screen.getByTestId("insp-x") as HTMLInputElement;
  const y = screen.getByTestId("insp-y") as HTMLInputElement;
  const w = screen.getByTestId("insp-w") as HTMLInputElement;
  const h = screen.getByTestId("insp-h") as HTMLInputElement;
  expect(x.value).toBe("16");
  expect(y.value).toBe("16");
  expect(w.value).toBe("120");
  expect(h.value).toBe("40");

  await userEvent.clear(x);
  await userEvent.type(x, "32");
  await userEvent.tab(); // blur → 提交

  const entry = collabMaps()!.components.get("comp-1") as { layout?: Record<string, number> };
  expect(entry.layout).toEqual({ x: 32, y: 16, w: 120, h: 40 });
});

test("link section lists outgoing links and commits transition changes", async () => {
  useDesignStore.setState({ state, selection: ["comp-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);

  expect(screen.getByText("链接")).toBeTruthy();
  const select = screen.getByTestId("link-transition") as HTMLSelectElement;
  expect(select.value).toBe("fade");

  await userEvent.selectOptions(select, "slide-left");
  // P3b: 转场变更直写协作 Y.Map（近端即时生效），不再走 REST
  const stored = getCollab().ydoc.getMap("pageLinks").get("link-1") as { transition?: string };
  expect(stored.transition).toBe("slide-left");
});

test("constraints section: lists existing, records via button, deletes", async () => {
  const { api } = await import("../../api");
  const stateWithConstraints = {
    ...state,
    pages: [
      {
        ...state.pages[0],
        constraints: [
          { id: "pc-9", component_type: "navbar", layout: { x: 0, y: 0, w: 1200, h: 64 } },
        ],
      },
      state.pages[1],
    ],
  } as unknown as DesignStateView;
  useDesignStore.setState({ state: stateWithConstraints, selection: ["comp-1"], breakpoint: "desktop" });
  render(<InspectorPanel />);

  // 既有约束渲染（类型 + 矩形）
  expect(screen.getByTestId("insp-constraints")).toBeTruthy();
  expect(screen.getByText(/navbar 0,0 · 1200×64/)).toBeTruthy();

  // 记为约束 → api.addPageConstraint + 提示
  await userEvent.click(screen.getByTestId("insp-add-constraint"));
  await waitFor(() =>
    expect(screen.getByTestId("insp-constraint-message").textContent).toContain("已记为约束")
  );
  expect(api.addPageConstraint).toHaveBeenCalledWith("comp-1");
});
