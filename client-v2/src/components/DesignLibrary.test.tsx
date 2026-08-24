import { test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignLibrary } from "./DesignLibrary";

vi.mock("../api", () => ({
  api: {
    applyStyle: vi.fn().mockResolvedValue({ success: true }),
    addLibraryComponent: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("../lib/catalog", () => ({
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
