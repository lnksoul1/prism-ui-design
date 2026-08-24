import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

vi.mock("./ws/client", () => ({ connectPrismSocket: () => () => undefined }));
vi.mock("./api", () => ({
  api: { getState: vi.fn().mockResolvedValue({ projectName: "Demo", style: "s", tokens: {}, components: [], pages: [], currentPageId: null, comments: [], revision: 0 }) },
}));

test("App renders shell and loads project name", async () => {
  render(<App />);
  expect(screen.getByText("✦ Prism V2")).toBeTruthy();
  expect(await screen.findByText("Demo")).toBeTruthy();
});

test("breakpoint switcher offers three breakpoints", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: "桌面" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "平板" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "手机" })).toBeTruthy();
});
