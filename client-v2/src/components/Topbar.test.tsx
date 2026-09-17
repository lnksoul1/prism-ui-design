// client-v2/src/components/Topbar.test.tsx — 提示词按钮 → 弹层展示简报 + 复制；整理按钮 → 一键整理
import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Topbar } from "./Topbar";
import { api } from "../api";
import { useDesignStore } from "../stores/design";

vi.mock("../api", () => ({
  api: { promptBrief: vi.fn(), tidyLayout: vi.fn() },
}));

const BRIEF = "# 演示项目 设计简报\n\n目标技术栈：React 19 + TypeScript";

beforeEach(() => {
  vi.mocked(api.promptBrief).mockReset();
  vi.mocked(api.promptBrief).mockResolvedValue({ success: true, brief: BRIEF });
  vi.mocked(api.tidyLayout).mockReset();
  useDesignStore.setState({ state: null, toastMsg: null });
});

test("点击「提示词」拉取简报并在弹层中展示", async () => {
  render(<Topbar />);
  await userEvent.click(screen.getByRole("button", { name: "提示词" }));
  expect(api.promptBrief).toHaveBeenCalledTimes(1);
  const modal = await screen.findByTestId("prompt-modal");
  const textarea = modal.querySelector("textarea") as HTMLTextAreaElement;
  expect(textarea.value).toBe(BRIEF);
  expect(textarea.readOnly).toBe(true);
});

test("「复制」调用剪贴板并给出 toast 反馈", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<Topbar />);
  await userEvent.click(screen.getByRole("button", { name: "提示词" }));
  await userEvent.click(await screen.findByTestId("prompt-copy"));
  expect(writeText).toHaveBeenCalledWith(BRIEF);
  expect(useDesignStore.getState().toastMsg).toContain("已复制");
});

test("「关闭」按钮关闭弹层", async () => {
  render(<Topbar />);
  await userEvent.click(screen.getByRole("button", { name: "提示词" }));
  await screen.findByTestId("prompt-modal");
  await userEvent.click(screen.getByRole("button", { name: "关闭" }));
  expect(screen.queryByTestId("prompt-modal")).toBeNull();
});

test("点击「整理」调用一键整理并 toast 应用数量", async () => {
  vi.mocked(api.tidyLayout).mockResolvedValue({ success: true, applied: 3 });
  render(<Topbar />);
  await userEvent.click(screen.getByRole("button", { name: "整理" }));
  expect(api.tidyLayout).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(useDesignStore.getState().toastMsg).toContain("已整理 3 个组件");
  });
});

test("「整理」失败时 toast 错误提示", async () => {
  vi.mocked(api.tidyLayout).mockRejectedValue(new Error("boom"));
  render(<Topbar />);
  await userEvent.click(screen.getByRole("button", { name: "整理" }));
  await waitFor(() => {
    expect(useDesignStore.getState().toastMsg).toContain("整理失败");
  });
});
