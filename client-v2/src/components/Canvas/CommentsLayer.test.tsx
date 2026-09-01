// client-v2/src/components/Canvas/CommentsLayer.test.tsx
import { test, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentsLayer } from "./CommentsLayer";
import { useDesignStore } from "../../stores/design";
import type { DesignStateView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    addComment: vi.fn().mockResolvedValue({ success: true }),
    updateComment: vi.fn().mockResolvedValue({ success: true }),
  },
}));
afterEach(() => vi.clearAllMocks());

const state = {
  projectName: "P", style: "s", tokens: {},
  pages: [{ id: "page-1", name: "首页", components: [
    { id: "comp-1", type: "text", props: { text: "hi" }, children: [], layout: { x: 100, y: 200, w: 300, h: 40 } },
  ]}],
  currentPageId: "page-1",
  comments: [
    { id: "cmt-1", component_id: "comp-1", author: "alice", text: "字太小", createdAt: "", x: 8, y: 8 },
    { id: "cmt-2", component_id: "comp-1", author: "bob", text: "已解决项", createdAt: "", resolved: true },
  ],
  revision: 1,
} as unknown as DesignStateView;

function setup() {
  useDesignStore.setState({ state, selection: [], breakpoint: "desktop", cqWidth: null });
}

test("renders unresolved comment pins positioned on the component", () => {
  setup();
  render(<CommentsLayer page={state.pages[0]} />);
  const pin = screen.getByTestId("comment-pin-cmt-1") as HTMLElement;
  expect(pin).toBeTruthy();
  expect(pin.style.left).toBe("108px"); // comp.x 100 + c.x 8
  expect(pin.style.top).toBe("208px");
  expect(screen.queryByTestId("comment-pin-cmt-2")).toBeNull(); // resolved 不显示
});

test("pin click opens popover; resolve calls updateComment", async () => {
  setup();
  const { api } = await import("../../api");
  render(<CommentsLayer page={state.pages[0]} />);
  await userEvent.click(screen.getByTestId("comment-pin-cmt-1"));
  expect(screen.getByText("字太小")).toBeTruthy();
  expect(screen.getByText(/alice/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "解决" }));
  expect(api.updateComment).toHaveBeenCalledWith("cmt-1", { resolved: true });
});
