// client-v2/src/components/Canvas/CommentsLayer.test.tsx
import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentsLayer } from "./CommentsLayer";
import { getCollab, initLocalCollabForTests } from "../../collab/collab";
import type { CommentView } from "../../types";

vi.mock("../../api", () => ({
  api: {
    addComment: vi.fn().mockResolvedValue({ success: true }),
    updateComment: vi.fn().mockResolvedValue({ success: true }),
  },
}));

beforeEach(() => {
  initLocalCollabForTests();
});

const page = {
  id: "page-1",
  name: "首页",
  components: [
    { id: "comp-1", type: "text", props: { text: "hi" }, children: [], layout: { x: 100, y: 200, w: 300, h: 40 } },
  ],
};

const comments: CommentView[] = [
  { id: "cmt-1", component_id: "comp-1", author: "alice", text: "字太小", createdAt: "", x: 8, y: 8 },
  { id: "cmt-2", component_id: "comp-1", author: "bob", text: "已解决项", createdAt: "", resolved: true },
];

/** P3a: 评论数据源是协作 Y.Map —— 测试里经本地 doc 预置。 */
function seedComments(list: CommentView[]): void {
  const map = getCollab().ydoc.getMap("comments");
  for (const c of list) map.set(c.id, { ...c });
}

function setup(): void {
  seedComments(comments);
}

test("renders unresolved comment pins positioned on the component", () => {
  setup();
  render(<CommentsLayer page={page} />);
  const pin = screen.getByTestId("comment-pin-cmt-1") as HTMLElement;
  expect(pin).toBeTruthy();
  expect(pin.style.left).toBe("108px"); // comp.x 100 + c.x 8
  expect(pin.style.top).toBe("208px");
  expect(screen.queryByTestId("comment-pin-cmt-2")).toBeNull(); // resolved 不显示
});

test("pin click opens popover; resolve writes the collab map", async () => {
  setup();
  render(<CommentsLayer page={page} />);
  await userEvent.click(screen.getByTestId("comment-pin-cmt-1"));
  expect(screen.getByText("字太小")).toBeTruthy();
  expect(screen.getByText(/alice/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "解决" }));
  // P3a: 解决 = 本地 Y.Map 更新（resolved: true），渲染随之摘除 pin
  const map = getCollab().ydoc.getMap("comments");
  const stored = map.get("cmt-1") as CommentView;
  expect(stored.resolved).toBe(true);
  expect(stored.updatedAt).toBeTruthy();
});

test("remote comment update re-renders the pin list", async () => {
  setup();
  render(<CommentsLayer page={page} />);
  expect(screen.getByTestId("comment-pin-cmt-1")).toBeTruthy();
  // 模拟远端/服务端 reconcile 写入: 更新 + 新增
  const map = getCollab().ydoc.getMap("comments");
  map.set("cmt-1", { ...comments[0], resolved: true });
  map.set("cmt-3", { id: "cmt-3", component_id: "comp-1", author: "carol", text: "新评论", createdAt: "" });
  expect(await screen.findByTestId("comment-pin-cmt-3")).toBeTruthy();
  expect(screen.queryByTestId("comment-pin-cmt-1")).toBeNull();
});
