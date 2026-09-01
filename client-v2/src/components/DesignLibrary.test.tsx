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
      {
        id: "button-1", name: "按钮", description: "", tags: [], type: "button", renderable: true,
        variant: "primary", props: { text: "预览按钮", variant: "primary" },
        variants: [
          { name: "主要", en: "primary" },
          { name: "幽灵", en: "ghost" },
          { name: "线框", en: "outline" },
          { name: "第四变体" },
          { name: "第五变体" },
        ],
      },
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

test("component card renders a scaled-down live preview box", async () => {
  const { container } = render(<DesignLibrary />);
  const card = (await screen.findByText("按钮")).closest(".lib-item") as HTMLElement;
  const preview = card.querySelector(".lib-preview") as HTMLElement;
  expect(preview).toBeTruthy();
  // 内层缩放容器 + 画布渲染器输出（按钮 → cv-button）
  expect(preview.querySelector(".lib-preview-inner")).toBeTruthy();
  expect(preview.querySelector(".cv-button")).toBeTruthy();
  expect(container.querySelectorAll(".lib-preview").length).toBe(2); // hero + button 卡片各一个
});

test("variant chips render only the first 4 variants under the card", async () => {
  const { container } = render(<DesignLibrary />);
  await screen.findByText("按钮");
  const chips = container.querySelectorAll(".lib-variant-chip");
  expect(chips.length).toBe(4);
  expect(screen.getByText("主要")).toBeTruthy();
  expect(screen.getByText("幽灵")).toBeTruthy();
  expect(screen.getByText("线框")).toBeTruthy();
  expect(screen.getByText("第四变体")).toBeTruthy();
  expect(screen.queryByText("第五变体")).toBeNull();
});

test("chip click adds the component with the variant name; card body click adds without variant", async () => {
  const { api } = await import("../api");
  const add = api.addLibraryComponent as unknown as { mock: { calls: unknown[][] } };
  render(<DesignLibrary />);
  await screen.findByText("幽灵"); // 等目录加载完成

  const before = add.mock.calls.length;
  await userEvent.click(screen.getByText("幽灵"));
  // stopPropagation：chip 点击只产生一次调用（不触发卡片默认的不带变体添加）
  await waitFor(() => expect(add.mock.calls.length).toBe(before + 1));
  expect(add.mock.calls[before]).toEqual(["button-1", "幽灵"]);

  await userEvent.click(screen.getByText("主视觉"));
  await waitFor(() => expect(add.mock.calls.length).toBe(before + 2));
  expect(add.mock.calls[before + 1]).toEqual(["hero-1"]);
});
