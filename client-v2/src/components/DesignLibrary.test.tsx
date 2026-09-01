import { test, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignLibrary } from "./DesignLibrary";

vi.mock("../api", () => ({
  api: {
    applyStyle: vi.fn().mockResolvedValue({ success: true }),
    addLibraryComponent: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("../lib/catalog", () => ({
  LIBRARY_COMPONENT_MIME: "text/prism-library-component",
  fetchCatalog: vi.fn().mockResolvedValue({
    styles: [
      { id: "minimal", name: "极简", description: "", tags: [], type: "style", props: {} },
    ],
    components: [
      { id: "hero-1", name: "主视觉", description: "", tags: [], type: "hero", renderable: true, props: {} },
      { id: "term-1", name: "知识术语", description: "", tags: [], type: "term", renderable: false, props: {} },
    ],
    termTemplates: [],
  }),
}));

test("renders styles and renderable components, applies style on click", async () => {
  render(<DesignLibrary />);
  expect(await screen.findByText("极简")).toBeTruthy();
  expect(screen.getByText("主视觉")).toBeTruthy();
  // renderable: false 的知识术语条目不进入可渲染组件列表
  expect(screen.queryByText("知识术语")).toBeNull();

  const { api } = await import("../api");
  await userEvent.click(screen.getByText("极简"));
  await waitFor(() => expect(api.applyStyle).toHaveBeenCalledWith("minimal"));

  await userEvent.click(screen.getByText("主视觉"));
  await waitFor(() => expect(api.addLibraryComponent).toHaveBeenCalledWith("hero-1"));
});

test("component card is draggable and writes library MIME payload on drag start", async () => {
  render(<DesignLibrary />);
  const card = (await screen.findByText("主视觉")).closest("button") as HTMLElement;
  expect(card).toBeTruthy();
  expect(card.draggable).toBe(true);

  // jsdom 未实现 DataTransfer：手工构造 dragstart 事件并挂 dataTransfer 桩
  const dt = { setData: vi.fn(), effectAllowed: "" };
  const dragStart = new Event("dragstart", { bubbles: true });
  (dragStart as unknown as { dataTransfer: unknown }).dataTransfer = dt;
  fireEvent(card, dragStart);

  expect(dt.setData).toHaveBeenCalledWith("text/prism-library-component", "hero-1");
  expect(dt.effectAllowed).toBe("copy");
});
